#!/usr/bin/env python3
"""
Pegasus summarization script using your trained model
Usage: python run_pegasus_summarizer.py <input.txt> <output.json>
"""

import sys
import json
import os
from transformers import PegasusForConditionalGeneration, PegasusTokenizer

def summarize_with_pegasus(text, model_path, max_length=150, min_length=40):
    """Summarize text using trained Pegasus model"""
    try:
        print(f"Loading Pegasus model from {model_path}...")
        
        # Load model and tokenizer
        model = PegasusForConditionalGeneration.from_pretrained(model_path)
        tokenizer = PegasusTokenizer.from_pretrained(model_path)
        
        print("Model loaded successfully")
        
        # Tokenize input
        inputs = tokenizer(text, max_length=1024, truncation=True, return_tensors="pt")
        
        # Generate summary
        print(f"Generating summary (max_length={max_length}, min_length={min_length})...")
        summary_ids = model.generate(
            inputs["input_ids"],
            max_length=max_length,
            min_length=min_length,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True
        )
        
        # Decode summary
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        
        print("Summary generated successfully")
        return summary
        
    except Exception as e:
        raise Exception(f"Pegasus summarization failed: {str(e)}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python run_pegasus_summarizer.py <input.txt> <output.json> [max_length] [min_length]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    max_length = int(sys.argv[3]) if len(sys.argv) > 3 else 150
    min_length = int(sys.argv[4]) if len(sys.argv) > 4 else 40
    
    # Model path - adjust if needed
    model_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'pegasus-trained/content/pegasus-trained'
    )
    
    print(f"Using model from: {model_path}")
    
    # Read input
    with open(input_path, 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Generate summary
    summary = summarize_with_pegasus(text, model_path, max_length=max_length, min_length=min_length)
    
    # Write output
    result = {
        'summary': summary,
        'method': 'pegasus-trained',
        'model_path': model_path,
        'input_length': len(text),
        'summary_length': len(summary)
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"Summary saved to {output_path}")

if __name__ == '__main__':
    main()
