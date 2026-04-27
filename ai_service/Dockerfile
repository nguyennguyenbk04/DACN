FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Mount pegasus model from host at runtime via volume (too large to COPY)
ENV PEGASUS_MODEL_PATH=/app/pegasus-trained/content/pegasus-trained
ENV WHISPER_MODEL=base

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
