"""
Quizum AI Service — FastAPI
Models are loaded once at startup and reused across all requests.
Endpoints: /transcribe, /summarize, /mcq, /evaluate/wer, /evaluate/rouge, /health
"""

import os
import tempfile
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import whisper
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rouge_score import rouge_scorer
from transformers import LEDForConditionalGeneration, AutoTokenizer
import jiwer
from leaf_mcq import MCQPipeline

# ── Global model holders ──────────────────────────────────────────────────────
_whisper_cache: dict = {}   # {model_name: whisper model}
_led_model = None
_led_tok = None
_mcq_pipeline = None

LEAF_MODELS = os.environ.get("LEAF_MODELS_PATH", "/app/leaf-models")
LED_MODEL_ID = os.environ.get("LED_MODEL_ID", "pszemraj/led-base-book-summary")


def _load_whisper(name: str):
    if name not in _whisper_cache:
        print(f"[whisper] Loading model '{name}'…")
        _whisper_cache[name] = whisper.load_model(name)
        print(f"[whisper] Model '{name}' ready")
    return _whisper_cache[name]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _led_model, _led_tok, _mcq_pipeline

    whisper_name = os.environ.get("WHISPER_MODEL", "base")
    print(f"[startup] Loading Whisper '{whisper_name}'…")
    _load_whisper(whisper_name)
    print("[startup] Whisper ready")

    print(f"[startup] Loading LED from {LED_MODEL_ID}…")
    _led_tok   = AutoTokenizer.from_pretrained(LED_MODEL_ID)
    _led_model = LEDForConditionalGeneration.from_pretrained(LED_MODEL_ID)
    _led_model.eval()
    print("[startup] LED ready")

    qg_ckpt = os.path.join(LEAF_MODELS, "question_generation", "multitask-qg-ag.ckpt")
    dg_ckpt = os.path.join(LEAF_MODELS, "distractor_generation", "race-distractors.ckpt")
    s2v_path = os.path.join(LEAF_MODELS, "sense2vec", "s2v_old")

    if os.path.exists(qg_ckpt) and os.path.exists(dg_ckpt):
        print("[startup] Loading Leaf MCQ pipeline…")
        _mcq_pipeline = MCQPipeline(
            qg_ckpt=qg_ckpt,
            dg_ckpt=dg_ckpt,
            s2v_path=s2v_path if os.path.exists(s2v_path) else None,
        )
    else:
        print(f"[startup] WARNING: Leaf model checkpoints not found at {LEAF_MODELS} — MCQ will fail")

    yield
    print("[shutdown] AI service stopping")


app = FastAPI(title="Quizum AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    text: str
    max_length: int = 300
    min_length: int = 80


class MCQRequest(BaseModel):
    text: str
    num_questions: int = 5


class WERRequest(BaseModel):
    hypothesis: str
    reference: str


class ROUGERequest(BaseModel):
    hypothesis: str
    reference: str


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "ok": True,
        "whisper_loaded": list(_whisper_cache.keys()),
        "led": _led_model is not None,
        "mcq": _mcq_pipeline is not None,
    }


# ── Transcription ─────────────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), model: str = Form("base")):
    if not _whisper_cache and not os.environ.get("WHISPER_MODEL"):
        raise HTTPException(503, "Whisper model not loaded")

    mdl = _load_whisper(model)

    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    try:
        result = mdl.transcribe(tmp_path, verbose=False)
    finally:
        os.unlink(tmp_path)

    segments = [
        {"start": s["start"], "end": s["end"], "text": s["text"].strip()}
        for s in result.get("segments", [])
    ]
    return {
        "segments": segments,
        "fullText": result.get("text", "").strip(),
        "language": result.get("language", "unknown"),
    }


# ── Summarization ─────────────────────────────────────────────────────────────

@app.post("/summarize")
def summarize(req: SummarizeRequest):
    if _led_model is None:
        raise HTTPException(503, "LED model not loaded")

    inputs = _led_tok(
        req.text,
        max_length=16384,
        truncation=True,
        return_tensors="pt",
    )
    # LED requires global attention on the first token
    global_attention_mask = torch.zeros_like(inputs["input_ids"])
    global_attention_mask[:, 0] = 1

    input_tokens = inputs["input_ids"].shape[1]
    max_length = max(150, min(1024, input_tokens // 3))
    min_length = max(80, max_length // 4)

    with torch.no_grad():
        ids = _led_model.generate(
            inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            global_attention_mask=global_attention_mask,
            max_length=max_length,
            min_length=min_length,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True,
        )
    summary = _led_tok.decode(ids[0], skip_special_tokens=True)
    return {"summary": summary, "model": LED_MODEL_ID}


# ── MCQ generation ────────────────────────────────────────────────────────────

@app.post("/mcq")
def generate_mcq(req: MCQRequest):
    if _mcq_pipeline is None:
        raise HTTPException(503, "MCQ pipeline not loaded — place Leaf model checkpoints in LEAF_MODELS_PATH")

    num = min(req.num_questions, 15)
    mcqs = _mcq_pipeline.generate(req.text, num_questions=num)
    return {"mcqs": mcqs, "model": "leaf/t5-small-qg+distractor"}


# ── Evaluation metrics ────────────────────────────────────────────────────────

_wer_transform = jiwer.Compose([
    jiwer.ToLowerCase(),
    jiwer.RemovePunctuation(),
    jiwer.Strip(),
    jiwer.ReduceToListOfListOfWords(),
])


@app.post("/evaluate/wer")
def evaluate_wer(req: WERRequest):
    """Word Error Rate — measures transcription accuracy against a human reference."""
    wer = jiwer.wer(
        req.reference,
        req.hypothesis,
        truth_transform=_wer_transform,
        hypothesis_transform=_wer_transform,
    )
    return {
        "wer": round(wer, 4),
        "wer_percent": round(wer * 100, 2),
        "interpretation": "lower is better (0 = perfect match)",
    }


@app.post("/evaluate/rouge")
def evaluate_rouge(req: ROUGERequest):
    """ROUGE scores — measures summarization quality against a reference summary."""
    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    scores = scorer.score(req.reference, req.hypothesis)

    def fmt(s):
        return {
            "precision": round(s.precision, 4),
            "recall": round(s.recall, 4),
            "f1": round(s.fmeasure, 4),
        }

    return {
        "rouge1": fmt(scores["rouge1"]),
        "rouge2": fmt(scores["rouge2"]),
        "rougeL": fmt(scores["rougeL"]),
        "interpretation": "higher F1 is better (1.0 = perfect match)",
    }
