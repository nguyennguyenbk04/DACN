"""
Fine-tune google/pegasus-large or google/pegasus-x-large on CNN/DailyMail,
with an optional BRIO contrastive stage that pushes ROUGE-2 from ~21.5 → ~22.5.

─── Two training modes ────────────────────────────────────────────────────────

  mle  (default) — Standard cross-entropy fine-tuning.
  brio           — MLE phase → candidate generation → contrastive fine-tuning.

─── Quick-start examples ──────────────────────────────────────────────────────

  # Standard fine-tune with pegasus-large (T4-safe)
  python train.py --model pegasus-large

  # Long-context version: pegasus-x handles full lecture transcripts (16 k tokens)
  python train.py --model pegasus-x --batch_size 1 --grad_accum 32

  # Full BRIO pipeline
  python train.py --model pegasus-large --mode brio

  # Quick smoke-test (no GPU needed)
  python train.py --subset 300 --epochs 1 --no_fp16

  # Resume after Colab crash
  python train.py --resume --output_dir /content/drive/MyDrive/pegasus-out

─── BRIO in one sentence ──────────────────────────────────────────────────────

  After MLE training, generate N beam-search candidates per article, rank them
  by ROUGE, then add a margin-ranking loss so the model assigns higher probability
  to better candidates.  This directly aligns training with beam-search inference.

  Paper: "BRIO: Bringing Order to Abstractive Summarization" — Liu et al., ACL 2022
"""

import argparse
import json
import os
from pathlib import Path

import evaluate
import numpy as np
import torch
from datasets import load_dataset, Dataset
from torch.nn import CrossEntropyLoss
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)

# ── Shortcuts ────────────────────────────────────────────────────────────────
MODEL_ALIASES = {
    "pegasus-large": "google/pegasus-large",
    "pegasus-x":     "google/pegasus-x-large",
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Arguments
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser()

    # Model / data
    p.add_argument("--model", default="pegasus-large",
                   choices=list(MODEL_ALIASES), help="Base model to fine-tune")
    p.add_argument("--output_dir", default="../pegasus-trained/content/pegasus-trained")
    p.add_argument("--subset", type=int, default=None,
                   help="Train on first N examples (None = full 287 k)")

    # Training mode
    p.add_argument("--mode", default="mle", choices=["mle", "brio"],
                   help="mle: standard fine-tune  |  brio: MLE + contrastive stage")

    # MLE hyper-parameters
    p.add_argument("--epochs",     type=int,   default=3)
    p.add_argument("--batch_size", type=int,   default=2)
    p.add_argument("--grad_accum", type=int,   default=8)
    p.add_argument("--lr",         type=float, default=5e-5)
    p.add_argument("--max_input",  type=int,   default=None,
                   help="Max input tokens (default: 1024 for pegasus-large, 4096 for pegasus-x)")
    p.add_argument("--max_target", type=int,   default=128)
    p.add_argument("--eval_steps", type=int,   default=500)

    # BRIO hyper-parameters
    p.add_argument("--brio_candidates", type=int,   default=8,
                   help="Number of beam-search candidates to generate per article")
    p.add_argument("--brio_alpha",      type=float, default=0.01,
                   help="Weight of contrastive loss relative to MLE loss")
    p.add_argument("--brio_margin",     type=float, default=0.001,
                   help="Per-rank margin λ in the BRIO ranking loss")
    p.add_argument("--brio_epochs",     type=int,   default=2,
                   help="Extra epochs for the BRIO contrastive stage")
    p.add_argument("--brio_lr",         type=float, default=1e-5,
                   help="Learning rate for the BRIO stage (lower than MLE)")
    p.add_argument("--candidates_file", default=None,
                   help="Path to pre-generated candidates JSONL (skips generation step)")

    # Misc
    p.add_argument("--resume",   action="store_true")
    p.add_argument("--no_fp16", action="store_true")

    args = p.parse_args()

    # Set sensible max_input default per model
    if args.max_input is None:
        args.max_input = 4096 if args.model == "pegasus-x" else 1024

    args.model_id = MODEL_ALIASES[args.model]
    return args


# ─────────────────────────────────────────────────────────────────────────────
# 2. Data helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_preprocess_fn(tokenizer, max_input, max_target):
    def preprocess(batch):
        model_inputs = tokenizer(
            batch["article"],
            max_length=max_input,
            truncation=True,
            padding=False,
        )
        labels = tokenizer(
            text_target=batch["highlights"],
            max_length=max_target,
            truncation=True,
            padding=False,
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs
    return preprocess


def make_compute_metrics(tokenizer):
    rouge = evaluate.load("rouge")

    def compute_metrics(eval_preds):
        preds, labels = eval_preds
        if isinstance(preds, tuple):
            preds = preds[0]
        preds  = np.clip(preds, 0, tokenizer.vocab_size - 1)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)

        decoded_preds  = tokenizer.batch_decode(preds,  skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)
        decoded_preds  = ["\n".join(p.strip().split(". ")) for p in decoded_preds]
        decoded_labels = ["\n".join(l.strip().split(". ")) for l in decoded_labels]

        scores = rouge.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)
        return {k: round(v * 100, 4) for k, v in scores.items()}

    return compute_metrics


def load_and_tokenize(args, tokenizer):
    print("\nLoading CNN/DailyMail 3.0.0…")
    raw = load_dataset("cnn_dailymail", "3.0.0")

    if args.subset:
        raw["train"]      = raw["train"].select(range(min(args.subset, len(raw["train"]))))
        raw["validation"] = raw["validation"].select(range(min(max(args.subset // 10, 100), len(raw["validation"]))))

    print(f"  Train: {len(raw['train'])}  |  Val: {len(raw['validation'])}")

    preprocess = make_preprocess_fn(tokenizer, args.max_input, args.max_target)
    cols = raw["train"].column_names
    tokenized = raw.map(preprocess, batched=True, remove_columns=cols, desc="Tokenizing")
    tokenized.set_format("torch")
    return raw, tokenized


# ─────────────────────────────────────────────────────────────────────────────
# 3. MLE training (Phase 1)
# ─────────────────────────────────────────────────────────────────────────────

def build_training_args(args, output_dir, epochs, lr, suffix=""):
    return Seq2SeqTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=lr,
        warmup_ratio=0.06,
        weight_decay=0.01,
        max_grad_norm=0.1,
        label_smoothing_factor=0.1,
        fp16=not args.no_fp16,
        gradient_checkpointing=True,
        predict_with_generate=True,
        generation_max_length=args.max_target,
        generation_num_beams=4,
        eval_strategy="steps",
        eval_steps=args.eval_steps,
        save_strategy="steps",
        save_steps=args.eval_steps,
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="rouge2",
        greater_is_better=True,
        logging_steps=50,
        logging_first_step=True,
        report_to="none",
    )


def run_mle(args, model, tokenizer, tokenized, raw):
    print("\n── Phase 1: MLE fine-tuning ──────────────────────────────")
    mle_dir = os.path.join(args.output_dir, "mle")
    training_args = build_training_args(args, mle_dir, args.epochs, args.lr)

    collator = DataCollatorForSeq2Seq(
        tokenizer, model=model, padding=True,
        pad_to_multiple_of=8 if not args.no_fp16 else None,
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=collator,
        compute_metrics=make_compute_metrics(tokenizer),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    checkpoint = mle_dir if args.resume and os.path.isdir(mle_dir) else None
    trainer.train(resume_from_checkpoint=checkpoint)
    trainer.save_model(mle_dir)
    tokenizer.save_pretrained(mle_dir)
    print(f"  MLE model saved → {mle_dir}")
    return mle_dir


# ─────────────────────────────────────────────────────────────────────────────
# 4. Candidate generation (Phase 2a — BRIO only)
# ─────────────────────────────────────────────────────────────────────────────

def rouge_score_single(pred, ref, scorer):
    """ROUGE-1 + ROUGE-2 + ROUGE-L average for one example."""
    s = scorer.score(ref, pred)
    return (s["rouge1"].fmeasure + s["rouge2"].fmeasure + s["rougeL"].fmeasure) / 3


def generate_candidates(args, model_dir, raw_train, tokenizer):
    """
    For each training article generate `args.brio_candidates` diverse beam
    summaries using the MLE-fine-tuned model, score each with ROUGE against
    the gold highlights, and write results to a JSONL file.
    """
    from rouge_score import rouge_scorer as rs_lib

    out_path = os.path.join(args.output_dir, "candidates.jsonl")
    if os.path.exists(out_path):
        print(f"  Candidates file already exists: {out_path} — skipping generation")
        return out_path

    print(f"\n── Phase 2a: Generating {args.brio_candidates} candidates per article ──")
    print(f"  Loading MLE model from {model_dir}…")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    gen_model = AutoModelForSeq2SeqLM.from_pretrained(model_dir).to(device)
    gen_model.eval()
    scorer = rs_lib.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

    N = args.brio_candidates
    # Diverse beam search: num_beam_groups divides num_beams
    num_beams  = max(N, 8)
    num_groups = min(4, N)

    written = 0
    with open(out_path, "w") as f:
        for idx, example in enumerate(raw_train):
            if idx % 500 == 0:
                print(f"  {idx}/{len(raw_train)}")

            article    = example["article"]
            gold       = example["highlights"]

            inputs = tokenizer(
                article,
                max_length=args.max_input,
                truncation=True,
                return_tensors="pt",
            ).to(device)

            with torch.no_grad():
                outputs = gen_model.generate(
                    **inputs,
                    num_beams=num_beams,
                    num_beam_groups=num_groups,
                    diversity_penalty=0.8,
                    num_return_sequences=N,
                    max_length=args.max_target,
                    early_stopping=True,
                )

            candidates = tokenizer.batch_decode(outputs, skip_special_tokens=True)
            scores = [rouge_score_single(c, gold, scorer) for c in candidates]

            f.write(json.dumps({
                "article":    article,
                "gold":       gold,
                "candidates": candidates,
                "scores":     scores,
            }) + "\n")
            written += 1

    print(f"  Wrote {written} examples → {out_path}")
    del gen_model
    torch.cuda.empty_cache()
    return out_path


# ─────────────────────────────────────────────────────────────────────────────
# 5. BRIO contrastive trainer (Phase 2b)
# ─────────────────────────────────────────────────────────────────────────────

class BRIOTrainer(Seq2SeqTrainer):
    """
    Subclass of Seq2SeqTrainer that adds the BRIO margin-ranking loss.

    total_loss = L_MLE(gold) + alpha × L_contrast(candidates)

    L_contrast: for every ordered pair (i, j) where candidate i has higher ROUGE
    than j, penalise if the model's length-normalised NLL for i is NOT smaller
    than for j by at least margin × (j − i).

    f(ŷ | x)  = mean_token_NLL(ŷ | x)          (lower = model prefers ŷ)
    L_ij      = max(0, f(ŷ_i|x) − f(ŷ_j|x) + margin × (j−i))
    """

    def __init__(self, *args, candidates_ds, alpha=0.01, margin=0.001, **kwargs):
        super().__init__(*args, **kwargs)
        # index candidates_ds by article text for fast lookup
        self._cands = {row["article"]: row for row in candidates_ds}
        self.alpha  = alpha
        self.margin = margin
        self._loss_fct = CrossEntropyLoss(reduction="none", ignore_index=-100)

    # ------------------------------------------------------------------
    def _seq_nll(self, model, input_ids, attention_mask, cand_ids, cand_mask):
        """
        Compute length-normalised NLL for a batch of (article, candidate) pairs.

        input_ids      : (M, src_len)
        cand_ids       : (M, tgt_len)  — labels with -100 for padding
        Returns        : (M,) mean-token NLL per sequence
        """
        labels = cand_ids.clone()
        labels[cand_mask == 0] = -100

        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels,
        )
        # Logits: (M, tgt_len, vocab) — for seq2seq the model aligns with labels
        logits = outputs.logits
        M, T, V = logits.shape

        token_loss = self._loss_fct(
            logits.reshape(M * T, V),
            labels.reshape(M * T),
        ).reshape(M, T)  # (M, T)

        valid = (labels != -100).float()   # (M, T)
        # Mean NLL over valid tokens (length-normalised)
        nll = (token_loss * valid).sum(-1) / valid.sum(-1).clamp(min=1)  # (M,)
        return nll

    # ------------------------------------------------------------------
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        # ── Standard MLE loss on gold summary ──────────────────────────
        mle_out  = super().compute_loss(model, inputs, return_outputs=True)
        mle_loss = mle_out[0] if isinstance(mle_out, tuple) else mle_out

        if self.alpha == 0 or not self._cands:
            return (mle_loss, mle_out[1]) if return_outputs else mle_loss

        # ── Retrieve pre-generated candidates for this batch ────────────
        # The tokenizer stores article text in the raw dataset; we match by
        # decoding input_ids back to text to look up the candidates dict.
        src_ids = inputs.get("input_ids")  # (B, src_len)
        articles = self.tokenizer.batch_decode(src_ids, skip_special_tokens=True)

        batch_cands, batch_scores = [], []
        valid_indices = []
        for b_idx, article in enumerate(articles):
            row = self._cands.get(article)
            if row is None:
                continue
            batch_cands.append(row["candidates"])
            batch_scores.append(row["scores"])
            valid_indices.append(b_idx)

        if not valid_indices:
            return (mle_loss, mle_out[1]) if return_outputs else mle_loss

        # ── Tokenise candidates ─────────────────────────────────────────
        device    = src_ids.device
        N         = len(batch_cands[0])
        B_valid   = len(valid_indices)

        # Flatten all candidates: (B_valid × N) strings
        flat_cands = [c for cands in batch_cands for c in cands]
        enc = self.tokenizer(
            flat_cands,
            max_length=self.args.generation_max_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(device)
        cand_ids  = enc["input_ids"]        # (B*N, tgt_len)
        cand_mask = enc["attention_mask"]   # (B*N, tgt_len)

        # Repeat article inputs for each candidate
        valid_src_ids  = src_ids[valid_indices]                                    # (B_valid, src_len)
        valid_src_mask = inputs["attention_mask"][valid_indices]
        rep_src_ids    = valid_src_ids.unsqueeze(1).expand(-1, N, -1).reshape(B_valid * N, -1)
        rep_src_mask   = valid_src_mask.unsqueeze(1).expand(-1, N, -1).reshape(B_valid * N, -1)

        # ── Compute per-sequence NLL for all candidates ─────────────────
        nlls = self._seq_nll(model, rep_src_ids, rep_src_mask, cand_ids, cand_mask)
        nlls = nlls.reshape(B_valid, N)  # (B_valid, N)

        # ── Sort candidates by ROUGE score (index 0 = best) ─────────────
        scores_t = torch.tensor(batch_scores, device=device)  # (B_valid, N)
        order    = scores_t.argsort(dim=-1, descending=True)  # (B_valid, N)
        sorted_nlls = nlls.gather(1, order)                   # (B_valid, N)

        # ── Margin-ranking loss ─────────────────────────────────────────
        # For pair (i, j) with i better than j (i < j in sorted order):
        #   we want NLL[i] < NLL[j]  (better candidate has lower NLL)
        #   loss = max(0, NLL[i] − NLL[j] + margin × (j − i))
        contrast_loss = torch.tensor(0.0, device=device, requires_grad=True)
        count = 0
        for i in range(N):
            for j in range(i + 1, N):
                margin_ij = self.margin * (j - i)
                pair_loss  = torch.clamp(sorted_nlls[:, i] - sorted_nlls[:, j] + margin_ij, min=0)
                contrast_loss = contrast_loss + pair_loss.mean()
                count += 1

        if count:
            contrast_loss = contrast_loss / count

        total_loss = mle_loss + self.alpha * contrast_loss
        return (total_loss, mle_out[1]) if return_outputs else total_loss


def run_brio(args, mle_dir, tokenizer, tokenized, raw, candidates_file):
    print("\n── Phase 2b: BRIO contrastive fine-tuning ────────────────")

    # Load candidates
    print(f"  Loading candidates from {candidates_file}…")
    rows = []
    with open(candidates_file) as f:
        for line in f:
            rows.append(json.loads(line))
    print(f"  {len(rows)} candidate sets loaded")

    # Load MLE model as starting point
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model  = AutoModelForSeq2SeqLM.from_pretrained(mle_dir)

    brio_dir      = os.path.join(args.output_dir, "brio")
    training_args = build_training_args(args, brio_dir, args.brio_epochs, args.brio_lr)

    collator = DataCollatorForSeq2Seq(
        tokenizer, model=model, padding=True,
        pad_to_multiple_of=8 if not args.no_fp16 else None,
    )

    trainer = BRIOTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=collator,
        compute_metrics=make_compute_metrics(tokenizer),
        candidates_ds=rows,
        alpha=args.brio_alpha,
        margin=args.brio_margin,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    trainer.train()
    trainer.save_model(brio_dir)
    tokenizer.save_pretrained(brio_dir)
    print(f"  BRIO model saved → {brio_dir}")
    return brio_dir


# ─────────────────────────────────────────────────────────────────────────────
# 6. Final evaluation
# ─────────────────────────────────────────────────────────────────────────────

def final_eval(model_dir, args, tokenizer, raw):
    print(f"\n── Final evaluation on test set (n=500) ──────────────────")
    model    = AutoModelForSeq2SeqLM.from_pretrained(model_dir)
    test_sub = raw["test"].select(range(min(500, len(raw["test"]))))
    preprocess = make_preprocess_fn(tokenizer, args.max_input, args.max_target)
    test_tok   = test_sub.map(preprocess, batched=True, remove_columns=test_sub.column_names, desc="Tokenizing test")
    test_tok.set_format("torch")

    eval_args = Seq2SeqTrainingArguments(
        output_dir="/tmp/eval_tmp",
        per_device_eval_batch_size=args.batch_size,
        predict_with_generate=True,
        generation_max_length=args.max_target,
        generation_num_beams=4,
        fp16=not args.no_fp16,
        report_to="none",
    )
    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)
    trainer  = Seq2SeqTrainer(
        model=model, args=eval_args, tokenizer=tokenizer,
        data_collator=collator, compute_metrics=make_compute_metrics(tokenizer),
    )

    results = trainer.evaluate(test_tok, metric_key_prefix="test")
    print("\n" + "=" * 55)
    print("  Test Results")
    print("=" * 55)
    for k, v in sorted(results.items()):
        if "rouge" in k:
            print(f"  {k:<35} {v:.4f}")
    print("=" * 55)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# 7. Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"\n{'='*55}")
    print(f"  Model     : {args.model_id}")
    print(f"  Mode      : {args.mode}")
    print(f"  Max input : {args.max_input} tokens")
    print(f"  Output    : {args.output_dir}")
    print(f"  Subset    : {args.subset or 'full (287k)'}")
    print(f"{'='*55}")

    print(f"\nLoading tokenizer & model from {args.model_id}…")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    model     = AutoModelForSeq2SeqLM.from_pretrained(args.model_id)
    print(f"  Parameters: {model.num_parameters() / 1e6:.1f}M")

    raw, tokenized = load_and_tokenize(args, tokenizer)

    # ── MLE phase (always runs first) ─────────────────────────────────
    mle_dir = run_mle(args, model, tokenizer, tokenized, raw)

    if args.mode == "brio":
        # ── Phase 2a: candidate generation ────────────────────────────
        candidates_file = args.candidates_file or generate_candidates(
            args, mle_dir, raw["train"], tokenizer
        )
        # ── Phase 2b: contrastive fine-tuning ─────────────────────────
        final_dir = run_brio(args, mle_dir, tokenizer, tokenized, raw, candidates_file)
    else:
        final_dir = mle_dir

    # Copy final model to the root output_dir (where the AI service loads from)
    import shutil
    for fname in os.listdir(final_dir):
        shutil.copy2(os.path.join(final_dir, fname), args.output_dir)
    print(f"\nFinal model copied to {args.output_dir}")

    final_eval(args.output_dir, args, tokenizer, raw)


if __name__ == "__main__":
    main()
