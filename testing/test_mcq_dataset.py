"""
MCQ Pipeline Evaluation on SQuAD v1.1 validation set.

Metrics reported:
  - Generation rate     : % of contexts that produced at least 1 MCQ
  - BLEU-1/2/3/4        : n-gram overlap of generated questions vs SQuAD reference questions
  - ROUGE-1/2/L (F1)    : recall-oriented overlap for generated questions
  - Distractor validity : % of options that are unique and differ from the correct answer
  - Avg generation time : seconds per context

Usage:
    python testing/test_mcq_dataset.py [--n 50]

Results are written to testing/results/mcq_eval.json and mcq_eval_summary.txt.
"""

import sys
import os
import json
import time
import argparse
from pathlib import Path

# Allow importing from ai_service/
sys.path.insert(0, str(Path(__file__).parent.parent / "ai_service"))

LEAF_MODELS = Path(__file__).parent.parent / "leaf-models"
QG_CKPT = LEAF_MODELS / "question_generation"  / "multitask-qg-ag.ckpt"
DG_CKPT = LEAF_MODELS / "distractor_generation" / "race-distractors.ckpt"
S2V_PATH = LEAF_MODELS / "sense2vec" / "s2v_old"
RESULTS_DIR = Path(__file__).parent / "results"


# ── Metrics ───────────────────────────────────────────────────────────────────

def bleu_scores(hypothesis: str, reference: str) -> dict:
    from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
    import nltk
    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)
    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        nltk.download("punkt", quiet=True)

    smooth = SmoothingFunction().method1
    ref_tokens = reference.lower().split()
    hyp_tokens = hypothesis.lower().split()
    if not hyp_tokens or not ref_tokens:
        return {"bleu1": 0.0, "bleu2": 0.0, "bleu3": 0.0, "bleu4": 0.0}
    return {
        "bleu1": sentence_bleu([ref_tokens], hyp_tokens, weights=(1, 0, 0, 0), smoothing_function=smooth),
        "bleu2": sentence_bleu([ref_tokens], hyp_tokens, weights=(0.5, 0.5, 0, 0), smoothing_function=smooth),
        "bleu3": sentence_bleu([ref_tokens], hyp_tokens, weights=(0.33, 0.33, 0.33, 0), smoothing_function=smooth),
        "bleu4": sentence_bleu([ref_tokens], hyp_tokens, weights=(0.25, 0.25, 0.25, 0.25), smoothing_function=smooth),
    }


def rouge_scores(hypothesis: str, reference: str) -> dict:
    from rouge_score import rouge_scorer
    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    s = scorer.score(reference, hypothesis)
    return {
        "rouge1": round(s["rouge1"].fmeasure, 4),
        "rouge2": round(s["rouge2"].fmeasure, 4),
        "rougeL": round(s["rougeL"].fmeasure, 4),
    }


def distractor_validity(mcq: dict) -> dict:
    options  = mcq["options"]
    answer   = mcq["correctAnswer"].lower().strip()
    unique   = len(set(o.lower().strip() for o in options)) == len(options)
    no_echo  = all(o.lower().strip() != answer for i, o in enumerate(options) if i != mcq["correctIndex"])
    no_filler= sum(1 for o in options if o.lower() == "none of the above") == 0
    return {"unique_options": unique, "no_echo_distractors": no_echo, "no_filler": no_filler}


# ── Main evaluation loop ───────────────────────────────────────────────────────

def evaluate(n_samples: int = 50):
    from datasets import load_dataset
    from leaf_mcq import MCQPipeline

    print(f"\nLoading SQuAD v1.1 validation set (first {n_samples} unique contexts)…")
    squad = load_dataset("squad", split="validation")

    # Deduplicate by context — SQuAD has multiple Q&A per context
    seen, contexts_with_refs = set(), []
    for row in squad:
        ctx = row["context"]
        if ctx not in seen:
            seen.add(ctx)
            # Collect all reference questions for this context
            ref_qs = [r["question"] for r in squad if r["context"] == ctx]
            contexts_with_refs.append({"context": ctx, "ref_questions": ref_qs})
        if len(contexts_with_refs) == n_samples:
            break
    print(f"  Loaded {len(contexts_with_refs)} unique contexts.\n")

    print("Loading MCQ pipeline…")
    s2v = str(S2V_PATH) if S2V_PATH.exists() else None
    pipeline = MCQPipeline(qg_ckpt=str(QG_CKPT), dg_ckpt=str(DG_CKPT), s2v_path=s2v)

    # ── Run evaluation ────────────────────────────────────────────────────────
    all_results    = []
    bleu_totals    = {"bleu1": 0, "bleu2": 0, "bleu3": 0, "bleu4": 0}
    rouge_totals   = {"rouge1": 0, "rouge2": 0, "rougeL": 0}
    valid_totals   = {"unique_options": 0, "no_echo_distractors": 0, "no_filler": 0}
    generated_count = 0
    total_mcqs     = 0
    total_time     = 0.0

    print(f"Evaluating {n_samples} contexts…\n")
    for i, item in enumerate(contexts_with_refs):
        context   = item["context"]
        ref_qs    = item["ref_questions"]
        best_ref  = ref_qs[0]  # use first reference question for scoring

        t0   = time.time()
        mcqs = pipeline.generate(context, num_questions=1)
        elapsed = time.time() - t0
        total_time += elapsed

        result = {
            "context_id":    i,
            "context":       context[:200] + "…" if len(context) > 200 else context,
            "ref_question":  best_ref,
            "generated":     mcqs,
            "time_s":        round(elapsed, 2),
        }

        if mcqs:
            generated_count += 1
            gen_q = mcqs[0]["question"]

            # BLEU & ROUGE against best reference question
            bl = bleu_scores(gen_q, best_ref)
            ro = rouge_scores(gen_q, best_ref)
            for k in bleu_totals:
                bleu_totals[k] += bl[k]
            for k in rouge_totals:
                rouge_totals[k] += ro[k]

            # Distractor validity across all MCQs in this response
            for mcq in mcqs:
                dv = distractor_validity(mcq)
                for k in valid_totals:
                    valid_totals[k] += int(dv[k])
                total_mcqs += 1

            result["bleu"]  = bl
            result["rouge"] = ro

        all_results.append(result)

        # Progress
        status = f"✓ gen={mcqs[0]['question'][:60]!r}" if mcqs else "✗ no output"
        print(f"  [{i+1:>3}/{n_samples}] {status}  ({elapsed:.1f}s)")

    # ── Aggregate ─────────────────────────────────────────────────────────────
    gen_rate = generated_count / n_samples * 100
    avg_bleu = {k: round(v / max(generated_count, 1), 4) for k, v in bleu_totals.items()}
    avg_rouge= {k: round(v / max(generated_count, 1), 4) for k, v in rouge_totals.items()}
    avg_valid= {k: round(valid_totals[k] / max(total_mcqs, 1) * 100, 1) for k in valid_totals}
    avg_time = round(total_time / n_samples, 2)

    summary = {
        "n_contexts":        n_samples,
        "generated_count":   generated_count,
        "generation_rate_%": round(gen_rate, 1),
        "total_mcqs":        total_mcqs,
        "avg_time_s":        avg_time,
        "bleu":              avg_bleu,
        "rouge":             avg_rouge,
        "distractor_validity_%": avg_valid,
    }

    # ── Save results ──────────────────────────────────────────────────────────
    RESULTS_DIR.mkdir(exist_ok=True)
    json_path = RESULTS_DIR / "mcq_eval.json"
    txt_path  = RESULTS_DIR / "mcq_eval_summary.txt"

    with open(json_path, "w") as f:
        json.dump({"summary": summary, "details": all_results}, f, indent=2)

    report = f"""
MCQ Pipeline Evaluation Report
=================================
Model (QG)         : Leaf multitask-qg-ag (T5-small, SQuAD fine-tuned)
Model (Distractor) : Leaf race-distractors (T5-small, RACE fine-tuned)
Dataset            : SQuAD v1.1 validation
Samples evaluated  : {n_samples}

Generation
----------
  Generated rate   : {gen_rate:.1f}%  ({generated_count}/{n_samples} contexts)
  Total MCQs       : {total_mcqs}
  Avg time / ctx   : {avg_time:.2f}s

Question Quality (vs SQuAD reference questions)
-------------------------------------------------
  BLEU-1           : {avg_bleu['bleu1']:.4f}
  BLEU-2           : {avg_bleu['bleu2']:.4f}
  BLEU-3           : {avg_bleu['bleu3']:.4f}
  BLEU-4           : {avg_bleu['bleu4']:.4f}
  ROUGE-1 F1       : {avg_rouge['rouge1']:.4f}
  ROUGE-2 F1       : {avg_rouge['rouge2']:.4f}
  ROUGE-L F1       : {avg_rouge['rougeL']:.4f}

Distractor Quality
------------------
  Unique options   : {avg_valid['unique_options']:.1f}%
  No answer echo   : {avg_valid['no_echo_distractors']:.1f}%
  No filler opts   : {avg_valid['no_filler']:.1f}%

Full per-context results: {json_path}
""".strip()

    with open(txt_path, "w") as f:
        f.write(report)

    print("\n" + "=" * 55)
    print(report)
    print("=" * 55)
    print(f"\nResults saved to {RESULTS_DIR}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=50, help="Number of contexts to evaluate (default: 50)")
    args = parser.parse_args()
    evaluate(args.n)
