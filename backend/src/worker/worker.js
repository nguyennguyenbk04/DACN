const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const http  = require('http');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const { connectMongo } = require('../db/mongodb');
const connection = new IORedis(process.env.REDIS_URL || `redis://127.0.0.1:${process.env.REDIS_PORT || 6379}`);
const storage = require('../services/storage');
const Transcript = require('../models/transcript');
const pool = require('../db/mysql');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

function transcribeViaService(audioPath, model = 'base') {
  return new Promise((resolve, reject) => {
    const audioBuffer = fs.readFileSync(audioPath);
    const boundary = `--Boundary${Date.now()}`;

    // Build multipart body manually — no external packages needed
    const audioHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${path.basename(audioPath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const modelPart = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n--${boundary}--\r\n`
    );
    const body = Buffer.concat([audioHeader, audioBuffer, modelPart]);

    const serviceUrl = new URL(`${AI_SERVICE_URL}/transcribe`);
    const transport = serviceUrl.protocol === 'https:' ? https : http;

    const req = transport.request({
      hostname: serviceUrl.hostname,
      port:     serviceUrl.port || (serviceUrl.protocol === 'https:' ? 443 : 80),
      path:     serviceUrl.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 60 * 60 * 1000,   // 1 hour — Whisper on long files can be slow
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          const parsed = (() => { try { return JSON.parse(text); } catch { return {}; } })();
          return reject(new Error(parsed.detail || `AI service transcription failed: ${res.statusCode}`));
        }
        try { resolve(JSON.parse(text)); }
        catch { reject(new Error('Invalid JSON from AI service')); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Transcription request timed out')); });
    req.write(body);
    req.end();
  });
}

async function startWorker() {
  try { await connectMongo(); } catch (err) {
    console.warn('Worker failed to connect to MongoDB:', err.message);
  }

  const worker = new Worker('transcribe', async job => {
    const data = job.data || {};
    console.log('Worker processing job', job.id, data);
    const { videoUrl, youtubeUrl, filename = `video-${Date.now()}`, userId, whisperModel = 'base' } = data;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dacn-'));
    const videoPath = path.join(tmpDir, 'source_' + path.basename(filename));
    const audioPath = path.join(tmpDir, 'audio.wav');

    try {
      await pool.query(
        'INSERT INTO jobs (id, user_id, type, status, payload) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?',
        [job.id, userId, 'transcribe', 'running', JSON.stringify(data), 'running']
      );

      if (youtubeUrl) {
        console.log('Downloading from YouTube:', youtubeUrl);
        const ytBase = path.join(tmpDir, 'yt_audio');
        execSync(
          `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" --no-playlist --extractor-args "youtube:player_client=android,web" -o "${ytBase}.%(ext)s" "${youtubeUrl}"`,
          { stdio: 'inherit' }
        );
        const ytFile = fs.readdirSync(tmpDir).find(f => f.startsWith('yt_audio'));
        if (!ytFile) throw new Error('yt-dlp did not produce an output file');
        const ytFilePath = path.join(tmpDir, ytFile);
        execSync(
          `ffmpeg -y -i "${ytFilePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
          { stdio: 'inherit' }
        );
      } else {
        console.log('Downloading', videoUrl, '->', videoPath);
        await storage.downloadToFile(videoUrl, videoPath);
        console.log('Extracting audio…');
        execSync(
          `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
          { stdio: 'inherit' }
        );
      }

      console.log('Transcribing via AI service…');
      const transcriptObj = await transcribeViaService(audioPath, whisperModel);

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
