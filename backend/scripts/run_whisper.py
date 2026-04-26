#!/usr/bin/env python3
"""
Real Whisper transcription script using OpenAI Whisper.
Transcribes audio and outputs timestamped segments to JSON.
Usage: run_whisper.py /path/to/audio.wav /path/to/output.json [model_name]
"""
import sys
import json
import os
import whisper

def main():
    if len(sys.argv) < 3:
        print('Usage: run_whisper.py audio.wav output.json [model_name]')
        sys.exit(1)
    
    audio_path = sys.argv[1]
    output_path = sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('WHISPER_MODEL', 'medium')
    
    if not os.path.exists(audio_path):
        print(f'Error: Audio file not found: {audio_path}')
        sys.exit(1)
    
    print(f'Loading Whisper model: {model_name}...')
    model = whisper.load_model(model_name)
    
    print(f'Transcribing {os.path.basename(audio_path)}...')
    result = model.transcribe(audio_path, verbose=False)
    
    # Extract segments with timestamps
    segments = []
    for seg in result.get('segments', []):
        segments.append({
            'start': seg['start'],
            'end': seg['end'],
            'text': seg['text'].strip()
        })
    
    # Build full text
    full_text = result.get('text', '').strip()
    
    transcript = {
        'segments': segments,
        'fullText': full_text,
        'language': result.get('language', 'unknown')
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transcript, f, ensure_ascii=False, indent=2)
    
    print(f'Transcription complete: {len(segments)} segments, language: {transcript["language"]}')
    print(f'Wrote transcript to {output_path}')

if __name__ == '__main__':
    main()
