"""
Leaf Question Generation pipeline — adapted from KristiyanVachev/Leaf-Question-Generation.

Loads .ckpt PyTorch Lightning checkpoints without requiring pytorch-lightning
by extracting the state dict directly.

Models required (mount as volume at /app/leaf-models/):
  question_generation/multitask-qg-ag.ckpt
  distractor_generation/race-distractors.ckpt
  sense2vec/s2v_old/  (optional, fallback distractor source)
"""

import os
import random
import re
from typing import List, Tuple, Optional

import torch
from transformers import T5ForConditionalGeneration, T5TokenizerFast

SEP = "<sep>"
MASK = "[MASK]"
TOKENIZER_LEN = 32101  # t5-small vocab + <sep> token


def _load_ckpt(ckpt_path: str) -> Tuple[T5ForConditionalGeneration, T5TokenizerFast]:
    tokenizer = T5TokenizerFast.from_pretrained("t5-small")
    tokenizer.add_tokens(SEP)

    model = T5ForConditionalGeneration.from_pretrained("t5-small")
    model.resize_token_embeddings(TOKENIZER_LEN)

    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    # PL wraps the model as self.model, so keys are prefixed with "model."
    state_dict = {
        k[len("model."):]: v
        for k, v in ckpt["state_dict"].items()
        if k.startswith("model.")
    }
    model.load_state_dict(state_dict)
    model.eval()
    return model, tokenizer


class QuestionGenerator:
    def __init__(self, ckpt_path: str):
        self.model, self.tokenizer = _load_ckpt(ckpt_path)

    def generate_qna(self, context: str) -> Tuple[str, str]:
        """Generate a (answer, question) pair from context using [MASK]."""
        source = f"{MASK} {SEP} {context}"
        enc = self.tokenizer(
            source,
            max_length=300,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        with torch.no_grad():
            out_ids = self.model.generate(
                input_ids=enc["input_ids"],
                attention_mask=enc["attention_mask"],
                num_beams=4,
                max_length=80,
                repetition_penalty=2.5,
                length_penalty=1.0,
                early_stopping=True,
            )
        raw = self.tokenizer.decode(out_ids[0], skip_special_tokens=False,
                                    clean_up_tokenization_spaces=True)
        raw = raw.replace("<pad>", "").replace("</s>", "").strip()
        parts = [p.strip() for p in raw.split(SEP)]
        if len(parts) >= 2:
            return parts[0], parts[1]
        return "", parts[0]


class DistractorGenerator:
    def __init__(self, ckpt_path: str):
        self.model, self.tokenizer = _load_ckpt(ckpt_path)

    def generate(self, question: str, answer: str, context: str, n: int = 3) -> List[str]:
        source = f"{answer} {SEP} {question} {SEP} {context}"
        enc = self.tokenizer(
            source,
            max_length=512,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        with torch.no_grad():
            out_ids = self.model.generate(
                input_ids=enc["input_ids"],
                attention_mask=enc["attention_mask"],
                num_beams=max(n, 4),
                max_length=64,
                early_stopping=True,
            )
        raw = self.tokenizer.decode(out_ids[0], skip_special_tokens=False,
                                    clean_up_tokenization_spaces=True)
        raw = raw.replace("<pad>", "").replace("</s>", "").strip()
        parts = [p.strip() for p in raw.split(SEP) if p.strip()]
        distractors = [d for d in parts if d.lower() != answer.lower()]
        return list(dict.fromkeys(distractors))[:n]


class Sense2VecDistractors:
    def __init__(self, model_path: str):
        self._s2v = None
        try:
            import sense2vec
            self._s2v = sense2vec.Sense2Vec().from_disk(model_path)
            print(f"[leaf_mcq] sense2vec loaded from {model_path}")
        except Exception as e:
            print(f"[leaf_mcq] sense2vec not available: {e}")

    def generate(self, answer: str, n: int = 3) -> List[str]:
        if self._s2v is None:
            return []
        try:
            sense = answer.lower().replace(" ", "_")
            # Try common POS tags
            for tag in ("NOUN", "PROPN", "VERB", "ADJ"):
                key = f"{sense}|{tag}"
                if key in self._s2v:
                    results = self._s2v.most_similar(key, n=20)
                    candidates = []
                    for phrase, _ in results:
                        word = phrase.split("|")[0].replace("_", " ")
                        if word.lower() != answer.lower() and len(word) > 1:
                            candidates.append(word)
                        if len(candidates) == n:
                            break
                    if candidates:
                        return candidates
        except Exception as e:
            print(f"[leaf_mcq] sense2vec lookup failed: {e}")
        return []


def _clean_text(text: str) -> str:
    text = re.sub(r"\(.*?\)", "", text)
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _split_into_chunks(text: str, num_chunks: int) -> List[str]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not sentences:
        return [text]
    per_chunk = max(1, len(sentences) // num_chunks)
    chunks = []
    for i in range(0, len(sentences), per_chunk):
        chunk = " ".join(sentences[i: i + per_chunk])
        if chunk:
            chunks.append(chunk)
        if len(chunks) == num_chunks:
            break
    return chunks


class MCQPipeline:
    def __init__(self, qg_ckpt: str, dg_ckpt: str, s2v_path: Optional[str] = None):
        print("[leaf_mcq] Loading QuestionGenerator…")
        self.qg = QuestionGenerator(qg_ckpt)
        print("[leaf_mcq] Loading DistractorGenerator…")
        self.dg = DistractorGenerator(dg_ckpt)
        self.s2v = Sense2VecDistractors(s2v_path) if s2v_path else Sense2VecDistractors.__new__(Sense2VecDistractors)
        if not s2v_path:
            self.s2v._s2v = None
        print("[leaf_mcq] MCQ pipeline ready")

    def generate(self, text: str, num_questions: int = 5) -> List[dict]:
        text = _clean_text(text)
        chunks = _split_into_chunks(text, num_questions)
        mcqs = []

        for chunk in chunks:
            if len(mcqs) >= num_questions:
                break
            try:
                answer, question = self.qg.generate_qna(chunk)
                if not answer or not question:
                    continue

                distractors = self.dg.generate(question, answer, chunk, n=3)

                # Supplement with sense2vec if we don't have enough
                if len(distractors) < 3:
                    extras = self.s2v.generate(answer, n=3 - len(distractors))
                    distractors += [e for e in extras if e not in distractors]

                # Still not enough — skip this question
                if len(distractors) < 1:
                    continue

                # Pad to 3 with distinct fallbacks
                _fallbacks = ["None of the above", "All of the above", "Cannot be determined"]
                for fb in _fallbacks:
                    if len(distractors) >= 3:
                        break
                    if fb not in distractors:
                        distractors.append(fb)
                distractors = list(dict.fromkeys(distractors))[:3]

                options = distractors + [answer]
                random.shuffle(options)
                correct_index = options.index(answer)

                mcqs.append({
                    "question": question,
                    "options": options,
                    "correctIndex": correct_index,
                    "correctAnswer": answer,
                })
            except Exception as e:
                print(f"[leaf_mcq] chunk failed: {e}")
                continue

        return mcqs[:num_questions]
