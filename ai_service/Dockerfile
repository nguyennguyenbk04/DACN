FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download model weights into image layer (cached between builds)
RUN python -c "from transformers import T5ForConditionalGeneration, T5TokenizerFast; \
    T5TokenizerFast.from_pretrained('t5-small'); \
    T5ForConditionalGeneration.from_pretrained('t5-small')"

RUN python -c "from transformers import LEDForConditionalGeneration, AutoTokenizer; \
    AutoTokenizer.from_pretrained('pszemraj/led-base-book-summary'); \
    LEDForConditionalGeneration.from_pretrained('pszemraj/led-base-book-summary')"

COPY main.py leaf_mcq.py ./

# Leaf model checkpoints are mounted at runtime via volume
ENV LEAF_MODELS_PATH=/app/leaf-models
ENV LED_MODEL_ID=pszemraj/led-base-book-summary
ENV WHISPER_MODEL=base

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
