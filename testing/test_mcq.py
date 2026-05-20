"""
Test the Leaf MCQ pipeline end-to-end.
Run from the project root:
    python testing/test_mcq.py
"""

import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ai_service'))

LEAF_MODELS = os.path.join(os.path.dirname(__file__), '..', 'leaf-models')

QG_CKPT = os.path.join(LEAF_MODELS, 'question_generation', 'multitask-qg-ag.ckpt')
DG_CKPT = os.path.join(LEAF_MODELS, 'distractor_generation', 'race-distractors.ckpt')
S2V_PATH = os.path.join(LEAF_MODELS, 'sense2vec', 's2v_old')

SAMPLE_TEXT = """
Photosynthesis is the process by which green plants and some other organisms use sunlight
to synthesize nutrients from carbon dioxide and water. Photosynthesis in plants generally
involves the green pigment chlorophyll and generates oxygen as a by-product. The light
energy is converted into chemical energy, which is stored in glucose molecules. This
process occurs mainly in the leaves of plants, specifically in structures called chloroplasts.
The overall chemical equation for photosynthesis is: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2.
Without photosynthesis, most life on Earth would not be possible, since it forms the base
of the food chain and produces the oxygen that animals breathe.
"""


def main():
    from leaf_mcq import MCQPipeline

    print("=" * 60)
    print("Loading MCQ pipeline…")
    print("=" * 60)

    s2v = S2V_PATH if os.path.exists(S2V_PATH) else None
    pipeline = MCQPipeline(qg_ckpt=QG_CKPT, dg_ckpt=DG_CKPT, s2v_path=s2v)

    print("\nGenerating 3 MCQs from sample text…\n")
    mcqs = pipeline.generate(SAMPLE_TEXT, num_questions=3)

    if not mcqs:
        print("ERROR: No MCQs generated.")
        sys.exit(1)

    print(f"Generated {len(mcqs)} question(s):\n")
    for i, q in enumerate(mcqs, 1):
        print(f"Q{i}: {q['question']}")
        for j, opt in enumerate(q['options']):
            marker = " ✓" if j == q['correctIndex'] else ""
            print(f"    {j+1}. {opt}{marker}")
        print()

    print("Raw JSON output:")
    print(json.dumps(mcqs, indent=2))


if __name__ == '__main__':
    main()
