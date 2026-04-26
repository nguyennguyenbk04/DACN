# Quizum — System Documentation

## Overview

**Quizum** is a full-stack AI-powered video learning platform. Users upload videos, which are automatically transcribed. The transcript can then be summarized, translated, and used to generate interactive multiple-choice quizzes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Job Queue | BullMQ + Redis |
| Transcription | OpenAI Whisper (Python, via venv) |
| Summarization | Fine-tuned Pegasus model (Python, via venv) |
| MCQ Generation | Groq API — `llama-3.3-70b-versatile` |
| Translation | Google Translate API (`@vitalets/google-translate-api`) |
| Video Storage | MinIO (S3-compatible object storage) |
| Job Metadata | MySQL |
| Transcript Storage | MongoDB |

---

## Application Functions

### 1. User Authentication
- **Register** — create a new account with name, email, and password
- **Login** — authenticate with email and password; session stored via JWT
- **Logout** — clear session and return to login screen
- **User menu** — displays logged-in user's name and email; accessible from the navbar

---

### 2. Video Upload & Transcription
- **Upload video** — drag-and-drop or click-to-browse file upload (any video format supported by ffmpeg)
- **Async processing** — upload enqueues a background job; the user does not have to wait on-screen
- **Audio extraction** — worker automatically extracts a 16kHz mono WAV from the video using `ffmpeg`
- **Transcription** — extracted audio is transcribed using OpenAI Whisper (`base` model by default, configurable via `WHISPER_MODEL` env var)
- **Transcript storage** — full transcript text and word-level segments stored in MongoDB; job metadata stored in MySQL

---

### 3. Job History
- **View all jobs** — paginated list of all upload/transcription jobs with status (`pending`, `active`, `completed`, `failed`)
- **Job status polling** — frontend polls job status until transcription completes
- **Delete job** — removes a job and its associated transcript from both MySQL and MongoDB
- **Select job** — clicking a job opens the Transcript Viewer for that video

---

### 4. Videos Library
- **Browse uploaded videos** — lists all videos stored in MinIO with filename, size, and last modified date
- **Job status badge** — each video shows the transcription job status if one exists
- **Open transcript** — clicking a video navigates directly to its transcript viewer

---

### 5. Transcript Viewer
- **View full transcript** — displays the complete transcript text for a video
- **Inline video player** — play the original video alongside the transcript inside the viewer modal
- **Close viewer** — dismiss the modal and return to the previous tab

---

### 6. AI Summarization
- **Generate summary** — sends the transcript to a fine-tuned Pegasus model and returns a condensed summary
- **Length control** — choose from three summary lengths:
  - **Short** (~60 words, 30–80 tokens)
  - **Medium** (~130 words, 50–150 tokens)
  - **Long** (~250 words, 100–280 tokens)
- **Translate summary** — translate the generated summary into any of 25 supported languages

---

### 7. Translation
- **Translate transcript** — translate the full transcript text into any supported language
- **Translate summary** — translate the generated summary independently of the transcript
- **Supported languages (25):** Vietnamese, English, Chinese (Simplified & Traditional), Japanese, Korean, French, German, Spanish, Portuguese, Italian, Russian, Arabic, Thai, Indonesian, Malay, Hindi, Turkish, Polish, Dutch, Swedish, Ukrainian, Czech, Romanian, Hungarian
- **Long-text chunking** — texts longer than 4500 characters are automatically split at sentence boundaries and reassembled after translation

---

### 8. MCQ Quiz Generation
- **Generate quiz** — sends the transcript to the Groq API (`llama-3.3-70b-versatile`) which returns a structured set of multiple-choice questions
- **Question count** — user selects how many questions to generate (1–15)
- **MCQ format** — each question has exactly 4 options with one correct answer
- **Interactive quiz UI** — user selects answers, submits, and sees which answers were correct/incorrect with colour feedback
- **Score display** — final score shown as a fraction (e.g. 4/5) after quiz submission
- **Retry quiz** — reset answers and attempt the quiz again

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/upload` | Upload a video file; enqueues transcription job |
| `GET` | `/api/jobs` | List all jobs (paginated) |
| `GET` | `/api/jobs/:jobId` | Get a specific job's status and details |
| `DELETE` | `/api/jobs/:jobId` | Delete a job and its transcript |
| `GET` | `/api/transcripts/:videoId` | Get the transcript for a video |
| `POST` | `/api/transcripts/:videoId/summarize` | Generate an AI summary of the transcript |
| `POST` | `/api/transcripts/:videoId/mcq` | Generate MCQs from the transcript |
| `POST` | `/api/translate` | Translate text to a target language |
| `GET` | `/api/videos` | List all videos stored in MinIO |

---

## Background Worker

The BullMQ worker (`src/worker/worker.js`) processes `transcribe` jobs from Redis:

1. Download video from MinIO to a temporary directory
2. Extract audio to 16kHz mono WAV using `ffmpeg`
3. Run `run_whisper.py` to transcribe the audio
4. Parse the Whisper output (word-level timestamps + full text)
5. Save the transcript to MongoDB
6. Update the job status in MySQL to `completed` (or `failed` on error)
7. Clean up all temporary files

---

## Python Scripts

| Script | Model | Purpose |
|---|---|---|
| `run_whisper.py` | OpenAI Whisper (`base`) | Audio → transcript JSON with word timestamps |
| `run_pegasus_summarizer.py` | Fine-tuned Pegasus (local) | Transcript → abstractive summary |
| `run_mcq_generator.py` | Groq `llama-3.3-70b-versatile` | Transcript → MCQ JSON array |

---

## Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `MYSQL_*` | MySQL connection settings |
| `MONGODB_URI` / `MONGODB_NAME` | MongoDB connection |
| `REDIS_URL` / `REDIS_PORT` | Redis connection |
| `MINIO_*` | MinIO object storage settings |
| `PORT` | Backend server port (default: 4000) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `VENV_PYTHON` | Absolute path to the Python venv binary |
| `WHISPER_MODEL` | Whisper model size (`tiny`, `base`, `small`, etc.) |
| `GROQ_API_KEY` | Groq API key for MCQ generation |
| `GEMINI_API_KEY` | Google Gemini API key (reserved) |
