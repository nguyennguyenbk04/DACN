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

async function startWorker() {
  // Ensure MongoDB connection for this worker process
  try {
    await connectMongo();
  } catch (err) {
    console.warn('Worker failed to connect to MongoDB:', err.message);
    // still proceed; operations that touch Mongo will fail and be handled per-job
  }

  const worker = new Worker('transcribe', async job => {
  const data = job.data || {};
  console.log('Worker processing job', job.id, data);
  const videoUrl = data.videoUrl;
  const filename = data.filename || `video-${Date.now()}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dacn-'));
  const videoPath = path.join(tmpDir, path.basename(filename));
  const audioPath = path.join(tmpDir, path.basename(filename) + '.wav');
  const transcriptJsonPath = path.join(tmpDir, 'transcript.json');

  try {
    // Download video from MinIO
    console.log('Downloading', videoUrl, '->', videoPath);
    await storage.downloadToFile(videoUrl, videoPath);

    // Extract audio (16k mono) using ffmpeg
    console.log('Extracting audio to', audioPath);
    execSync(`ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`, { stdio: 'inherit' });

    // Call Whisper transcription script (using venv Python)
    console.log('Running Whisper transcription...');
    const script = path.join(__dirname, '../../scripts/run_whisper.py');
    const venvPython = process.env.VENV_PYTHON || '/home/bnguyen/Desktop/DACN/venv/bin/python';
    const whisperModel = process.env.WHISPER_MODEL || 'base';
    execSync(`"${venvPython}" "${script}" "${audioPath}" "${transcriptJsonPath}" "${whisperModel}"`, { stdio: 'inherit' });

    // Read transcript JSON
    const content = fs.readFileSync(transcriptJsonPath, 'utf8');
    const transcriptObj = JSON.parse(content);

    // Save to MongoDB
    const doc = new Transcript({ videoId: job.id, segments: transcriptObj.segments || [], fullText: transcriptObj.fullText || '' });
    await doc.save();

    // Update jobs table in MySQL (mark completed and store result reference)
    const result = { transcriptId: doc._id.toString(), segments: doc.segments.length };
    await pool.query('INSERT INTO jobs (id, video_id, type, status, payload, result) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, result=?, video_id=?', [
      job.id, job.id, 'transcribe', 'completed', JSON.stringify(data), JSON.stringify(result), 'completed', JSON.stringify(result), job.id
    ]);

    console.log('Job completed', job.id);
    // cleanup temp
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    return { ok: true, transcriptId: doc._id.toString() };
  } catch (err) {
    console.error('Worker error', err);
    // Update job status to failed
    try {
      await pool.query('INSERT INTO jobs (id, video_id, type, status, payload, result) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, result=?, video_id=?', [
        job.id, job.id, 'transcribe', 'failed', JSON.stringify(data), JSON.stringify({ error: err.message }), 'failed', JSON.stringify({ error: err.message }), job.id
      ]);
    } catch (e) { console.warn('Failed to update jobs table', e.message); }
    throw err;
  }
  }, { connection });

  worker.on('completed', (job) => console.log('Worker emitted completed for', job.id));
  worker.on('failed', (job, err) => console.error('Worker failed', job && job.id, err && err.message));

  console.log('Worker started, waiting for jobs...');
}

startWorker().catch(err => {
  console.error('Failed to start worker', err);
});
