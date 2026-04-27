"""
Quizum AI Service — FastAPI
Models are loaded once at startup and reused across all requests.
Endpoints: /transcribe, /summarize, /mcq, /evaluate/wer, /evaluate/rouge, /health
"""

import os
import re
import json
import tempfile
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import whisper
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
from rouge_score import rouge_scorer
from transformers import PegasusForConditionalGeneration, PegasusTokenizer
import jiwer

# ── Global model holders ──────────────────────────────────────────────────────
_whisper = None
_pegasus_model = None
_pegasus_tok = None
_groq = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _whisper, _pegasus_model, _pegasus_tok, _groq

    whisper_name = os.environ.get("WHISPER_MODEL", "base")
    print(f"[startup] Loading Whisper '{whisper_name}'…")
    _whisper = whisper.load_model(whisper_name)
    print("[startup] Whisper ready")

    model_path = os.environ.get(
        "PEGASUS_MODEL_PATH",
        "/app/pegasus-trained/content/pegasus-trained",
    )
    print(f"[startup] Loading Pegasus from {model_path}…")
    _pegasus_model = PegasusForConditionalGeneration.from_pretrained(model_path)
    _pegasus_tok = PegasusTokenizer.from_pretrained(model_path)
    _pegasus_model.eval()
    print("[startup] Pegasus ready")

    api_key = os.environ.get("GROQ_API_KEY", "")
    if api_key:
        _groq = Groq(api_key=api_key)
        print("[startup] Groq client ready")
    else:
        print("[startup] WARNING: GROQ_API_KEY not set — MCQ generation will fail")

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
    max_length: int = 150
    min_length: int = 40


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
        "whisper": _whisper is not None,
        "pegasus": _pegasus_model is not None,
        "groq": _groq is not None,
    }


# ── Transcription ─────────────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if _whisper is None:
        raise HTTPException(503, "Whisper model not loaded")

    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    try:
        result = _whisper.transcribe(tmp_path, verbose=False)
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
    if _pegasus_model is None:
        raise HTTPException(503, "Pegasus model not loaded")

    inputs = _pegasus_tok(
        req.text,
        max_length=1024,
        truncation=True,
        return_tensors="pt",
    )
    with torch.no_grad():
        ids = _pegasus_model.generate(
            inputs["input_ids"],
            max_length=req.max_length,
            min_length=req.min_length,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True,
        )
    summary = _pegasus_tok.decode(ids[0], skip_special_tokens=True)
    return {"summary": summary, "model": "pegasus-trained"}


# ── MCQ generation ────────────────────────────────────────────────────────────

@app.post("/mcq")
def generate_mcq(req: MCQRequest):
    if _groq is None:
        raise HTTPException(503, "Groq client not initialized — set GROQ_API_KEY")

    num = min(req.num_questions, 15)
    prompt = f"""You are an educational quiz generator.
Given the following transcript, generate exactly {num} multiple-choice questions (MCQs).

Rules:
- Each question must be directly answerable from the transcript.
- Each question must have exactly 4 options.
- Exactly one option must be correct.
- Distractors must be plausible but clearly incorrect based on the transcript.
- Do NOT label options with A/B/C/D — just provide the option text.

Respond ONLY with a valid JSON array. No markdown, no explanation. Format:
[
  {{
    "question": "...",
    "options": ["option1", "option2", "option3", "option4"],
    "correctIndex": 0,
    "correctAnswer": "option1"
  }}
]

Transcript:
{req.text}
"""
    response = _groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE).strip()

    mcqs = json.loads(raw)
    for item in mcqs:
        if "correctAnswer" in item and "options" in item:
            try:
                item["correctIndex"] = item["options"].index(item["correctAnswer"])
            except ValueError:
                pass

    return {"mcqs": mcqs[:num], "model": "groq/llama-3.3-70b-versatile"}


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
