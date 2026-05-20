"""
Summarization Evaluation using LED (pszemraj/led-base-book-summary) on CNN/DailyMail.

Metrics reported:
  - ROUGE-1/2/L F1  : standard summarization benchmark scores
  - Avg length      : avg token count of generated summaries
  - Avg time / doc  : seconds per document

Usage:
    python testing/test_summarization.py [--n 50]

Results saved to testing/results/summarization_eval_summary.txt
                  testing/results/summarization_eval.json
"""

import sys
import os
import json
import time
import argparse
from pathlib import Path

import re
import torch
from transformers import LEDForConditionalGeneration, AutoTokenizer
from rouge_score import rouge_scorer
from datasets import load_dataset


def preprocess_dialogue(text: str) -> str:
    """Strip #PersonN#: speaker labels from DialogSum-style dialogues."""
    return re.sub(r"#Person\d+#:\s*", "", text).strip()

MODEL_ID    = os.environ.get("LED_MODEL_ID", "pszemraj/led-base-book-summary")
RESULTS_DIR = Path(__file__).parent / "results"


def evaluate(n_samples: int = 50):
    dataset_id = os.environ.get("EVAL_DATASET", "dialogsum")
    print(f"\nLoading {dataset_id} test split (first {n_samples} examples)…")

    if dataset_id == "dialogsum":
        dataset = load_dataset("knkarthick/dialogsum", split="test")
        doc_key, sum_key = "dialogue", "summary"
    elif dataset_id == "xsum":
        dataset = load_dataset("EdinburghNLP/xsum", split="test")
        doc_key, sum_key = "document", "summary"
    elif dataset_id == "pubmed":
        dataset = load_dataset("ccdv/pubmed-summarization", split="test")
        doc_key, sum_key = "article", "abstract"
    elif dataset_id == "arxiv":
        dataset = load_dataset("ccdv/arxiv-summarization", split="test")
        doc_key, sum_key = "article", "abstract"
    elif dataset_id == "booksum":
        dataset = load_dataset("kmfoda/booksum", split="test")
        doc_key, sum_key = "chapter", "summary"
    else:
        dataset = load_dataset("cnn_dailymail", "3.0.0", split="test")
        doc_key, sum_key = "article", "highlights"

    samples = [dataset[i] for i in range(min(n_samples, len(dataset)))]
    print(f"  Loaded {len(samples)} examples.\n")

    print(f"Loading {MODEL_ID}…")
    tok   = AutoTokenizer.from_pretrained(MODEL_ID)
    model = LEDForConditionalGeneration.from_pretrained(MODEL_ID)
    model.eval()
    print("Model ready.\n")

    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

    rouge_totals = {"rouge1": 0.0, "rouge2": 0.0, "rougeL": 0.0}
    total_gen_tokens = 0
    total_time = 0.0
    all_results = []

    for i, sample in enumerate(samples):
        article   = sample[doc_key]
        reference = sample[sum_key]

        if dataset_id == "dialogsum":
            article = preprocess_dialogue(article)
        # PubMed/arXiv sections are sometimes joined with newlines — flatten
        if dataset_id in ("pubmed", "arxiv"):
            article = " ".join(article.split())

        t0 = time.time()
        inputs = tok(article, return_tensors="pt", max_length=16384, truncation=True)
        global_attn = torch.zeros_like(inputs["input_ids"])
        global_attn[:, 0] = 1

        with torch.no_grad():
            ids = model.generate(
                inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                global_attention_mask=global_attn,
                max_length=150,
                min_length=40,
                length_penalty=2.0,
                num_beams=4,
                early_stopping=True,
            )
        elapsed = time.time() - t0
        total_time += elapsed

        summary = tok.decode(ids[0], skip_special_tokens=True)
        gen_tokens = ids.shape[1]
        total_gen_tokens += gen_tokens

        scores = scorer.score(reference, summary)
        for k in rouge_totals:
            rouge_totals[k] += scores[k].fmeasure

        all_results.append({
            "id":        i,
            "article":   article[:300] + "…",
            "reference": reference,
            "generated": summary,
            "rouge1":    round(scores["rouge1"].fmeasure, 4),
            "rouge2":    round(scores["rouge2"].fmeasure, 4),
            "rougeL":    round(scores["rougeL"].fmeasure, 4),
            "gen_tokens": gen_tokens,
            "time_s":    round(elapsed, 2),
        })

        print(f"  [{i+1:>3}/{n_samples}]  R1={scores['rouge1'].fmeasure:.3f}  "
              f"R2={scores['rouge2'].fmeasure:.3f}  RL={scores['rougeL'].fmeasure:.3f}  "
              f"({elapsed:.1f}s)  gen={summary[:60]!r}")

    avg_rouge = {k: round(v / n_samples, 4) for k, v in rouge_totals.items()}
    avg_tokens = round(total_gen_tokens / n_samples, 1)
    avg_time   = round(total_time / n_samples, 2)

    report = f"""
Summarization Evaluation Report
=================================
Model              : {MODEL_ID}
Dataset            : {dataset_id} (test split)
Samples evaluated  : {n_samples}

ROUGE Scores (F1)
-----------------
  ROUGE-1          : {avg_rouge['rouge1']:.4f}
  ROUGE-2          : {avg_rouge['rouge2']:.4f}
  ROUGE-L          : {avg_rouge['rougeL']:.4f}

Generation Stats
----------------
  Avg summary len  : {avg_tokens:.1f} tokens
  Avg time / doc   : {avg_time:.2f}s
  Total time       : {round(total_time, 1)}s
""".strip()

    RESULTS_DIR.mkdir(exist_ok=True)
    txt_path  = RESULTS_DIR / "summarization_eval_summary.txt"
    json_path = RESULTS_DIR / "summarization_eval.json"

    with open(txt_path, "w") as f:
        f.write(report)
    with open(json_path, "w") as f:
        json.dump({"summary": {
            "model": MODEL_ID, "n": n_samples,
            "rouge": avg_rouge, "avg_tokens": avg_tokens, "avg_time_s": avg_time,
        }, "details": all_results}, f, indent=2)

    print("\n" + "=" * 55)
    print(report)
    print("=" * 55)
    print(f"\nResults saved to {RESULTS_DIR}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=50, help="Number of articles to evaluate (default: 50)")
    args = parser.parse_args()
    evaluate(args.n)
