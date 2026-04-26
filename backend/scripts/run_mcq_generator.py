#!/usr/bin/env python3
"""
MCQ generation script using:
  - Groq API (llama-3.3-70b-versatile) : generate full MCQs in one call

Pipeline:
  1. Send the transcript + desired question count to Groq.
  2. Parse the structured JSON response.
  3. Output the MCQ array.

Usage:
  python run_mcq_generator.py <input.txt> <output.json> [num_questions]

Requires: GROQ_API_KEY in environment (or backend/.env)
"""

import sys
import json
import re
import os
import random
from pathlib import Path


def load_env():
    """Load .env from the backend directory into os.environ."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def load_groq():
    from groq import Groq
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set. Add it to backend/.env")
    client = Groq(api_key=api_key)
    print("Groq client ready.")
    return client


def generate_mcqs_with_groq(text, num_questions, client):
    """
    Ask Groq to generate MCQs from the transcript in one shot.
    Returns a list of MCQ dicts.
    """
    prompt = f"""You are an educational quiz generator.
Given the following transcript, generate exactly {num_questions} multiple-choice questions (MCQs).

Rules:
- Each question must be directly answerable from the transcript.
- Each question must have exactly 4 options.
- Exactly one option must be correct.
- Distractors (wrong options) must be plausible but clearly incorrect based on the transcript.
- Do NOT label options with A/B/C/D — just provide the option text.

Respond ONLY with a valid JSON array. No markdown, no explanation. Format:
[
  {{
    "question": "...",
    "options": ["option1", "option2", "option3", "option4"],
    "correctIndex": 0,
    "correctAnswer": "option1"
  }},
  ...
]

Transcript:
{text}
"""

    print("Calling Groq API...")
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()

    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE).strip()

    mcqs = json.loads(raw)

    # Normalise: ensure correctIndex is consistent with correctAnswer
    for item in mcqs:
        if "correctAnswer" in item and "options" in item:
            try:
                item["correctIndex"] = item["options"].index(item["correctAnswer"])
            except ValueError:
                pass

    return mcqs


def main():
    if len(sys.argv) < 3:
        print("Usage: python run_mcq_generator.py <input.txt> <output.json> [num_questions]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    num_questions = int(sys.argv[3]) if len(sys.argv) > 3 else 5

    load_env()

    with open(input_path, "r", encoding="utf-8") as f:
        text = f.read()

    print(f"Input text length: {len(text)} chars")
    print(f"Generating {num_questions} questions with Groq...")

    client = load_groq()
    mcqs = generate_mcqs_with_groq(text, num_questions, client)
    mcqs = mcqs[:num_questions]

    result = {
        "mcqs": mcqs,
        "count": len(mcqs),
        "model": "groq/llama-3.3-70b-versatile",
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"MCQs saved to {output_path} ({len(mcqs)} questions)")


if __name__ == "__main__":
    main()
