const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config();

const { connectMongo } = require('../db/mongodb');
const connection = new IORedis(process.env.REDIS_URL || `redis://127.0.0.1:${process.env.REDIS_PORT || 6379}`);
const storage = require('../services/storage');
const Transcript = require('../models/transcript');
const pool = require('../db/mysql');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function transcribeViaService(audioPath) {
  const audioBuffer = fs.readFileSync(audioPath);
  const formData = new FormData();
  formData.append('audio', new Blob([audioBuffer]), path.basename(audioPath));

  const res = await fetch(`${AI_SERVICE_URL}/transcribe`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service transcription failed: ${res.status}`);
  }
  return res.json();
}

async function startWorker() {
  try { await connectMongo(); } catch (err) {
    console.warn('Worker failed to connect to MongoDB:', err.message);
  }

  const worker = new Worker('transcribe', async job => {
    const data = job.data || {};
    console.log('Worker processing job', job.id, data);
    const { videoUrl, filename = `video-${Date.now()}`, userId } = data;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dacn-'));
    const videoPath = path.join(tmpDir, path.basename(filename));
    const audioPath = path.join(tmpDir, path.basename(filename) + '.wav');

    try {
      // Mark job as running
      await pool.query(
        'INSERT INTO jobs (id, user_id, type, status, payload) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?',
        [job.id, userId, 'transcribe', 'running', JSON.stringify(data), 'running']
      );

      console.log('Downloading', videoUrl, '->', videoPath);
      await storage.downloadToFile(videoUrl, videoPath);

      console.log('Extracting audio…');
      execSync(
        `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
        { stdio: 'inherit' }
      );

      console.log('Transcribing via AI service…');
      const transcriptObj = await transcribeViaService(audioPath);

      const doc = new Transcript({
        videoId: job.id,
        segments: transcriptObj.segments || [],
        fullText: transcriptObj.fullText || '',
        language: transcriptObj.language || 'unknown',
      });
      await doc.save();

      const result = { transcriptId: doc._id.toString(), segments: doc.segments.length, language: doc.language };
      await pool.query(
        'INSERT INTO jobs (id, user_id, type, status, payload, result) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, result=?',
        [job.id, userId, 'transcribe', 'completed', JSON.stringify(data), JSON.stringify(result), 'completed', JSON.stringify(result)]
      );

      console.log('Job completed', job.id);
      return { ok: true, transcriptId: doc._id.toString() };
    } catch (err) {
      console.error('Worker error', err);
      await pool.query(
        'INSERT INTO jobs (id, user_id, type, status, payload, result) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, result=?',
        [job.id, userId, 'transcribe', 'failed', JSON.stringify(data), JSON.stringify({ error: err.message }), 'failed', JSON.stringify({ error: err.message })]
      ).catch(e => console.warn('Failed to update jobs table', e.message));
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, { connection });

  worker.on('completed', job => console.log('Completed job', job.id));
  worker.on('failed', (job, err) => console.error('Failed job', job?.id, err?.message));
  console.log('Worker started, waiting for jobs…');
}

startWorker().catch(err => { console.error('Failed to start worker', err); process.exit(1); });
