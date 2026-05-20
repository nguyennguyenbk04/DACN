const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { uploadLocalFile, getPresignedUrl, listObjects } = require('../services/storage');
const { enqueueTranscription } = require('../services/queueService');
const mysql = require('../db/mysql');
const Transcript = require('../models/transcript');
const { summarize } = require('../services/summarizerService');
const { generateMCQ } = require('../services/mcqService');
const { translate } = require('@vitalets/google-translate-api');

const { randomUUID } = require('crypto');

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ── Upload setup ──────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/flac',
]);
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true }));

// ── Upload (store only — no transcription yet) ────────────────────────────────
router.post('/upload-youtube', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

    const ytRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/;
    if (!ytRegex.test(youtubeUrl)) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const jobId = randomUUID();
    const payload = { youtubeUrl, filename: `YouTube — ${youtubeUrl.slice(0, 60)}`, userId: req.user.userId };
    await mysql.query(
      'INSERT INTO jobs (id, user_id, type, status, payload) VALUES (?, ?, ?, ?, ?)',
      [jobId, req.user.userId, 'transcribe', 'ready', JSON.stringify(payload)]
    );
    res.json({ jobId, videoId: jobId, youtubeUrl });
  } catch (err) {
    console.error('YouTube upload error', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const jobId = randomUUID();
    const url = await uploadLocalFile(file.path, file.originalname);
    const payload = { videoUrl: url, filename: file.originalname, userId: req.user.userId };
    await mysql.query(
      'INSERT INTO jobs (id, user_id, type, status, payload) VALUES (?, ?, ?, ?, ?)',
      [jobId, req.user.userId, 'transcribe', 'ready', JSON.stringify(payload)]
    );

    fs.unlink(file.path, () => {});
    res.json({ jobId, videoId: jobId, url });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Upload error', err);
    res.status(err.message.includes('Unsupported') ? 400 : 500).json({ error: err.message });
  }
});

// ── Start transcription for a ready/failed job ────────────────────────────────
router.post('/jobs/:jobId/transcribe', async (req, res) => {
  try {
    const { whisperModel = 'base' } = req.body;
    const { jobId } = req.params;

    const [[job]] = await mysql.execute(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, req.user.userId]
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'ready' && job.status !== 'failed') {
      return res.status(409).json({ error: `Job is already ${job.status}` });
    }

    const payload = { ...(job.payload || {}), whisperModel };
    await mysql.query(
      'UPDATE jobs SET status = ?, payload = ? WHERE id = ?',
      ['queued', JSON.stringify(payload), jobId]
    );
    await enqueueTranscription(payload, jobId);
    res.json({ ok: true, jobId, status: 'queued' });
  } catch (err) {
    console.error('Start transcription error', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Jobs ──────────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await mysql.query(
      `SELECT id as job_id, user_id, type, status, created_at, updated_at,
              JSON_UNQUOTE(JSON_EXTRACT(payload, '$.filename'))   as filename,
              JSON_UNQUOTE(JSON_EXTRACT(result,  '$.error'))      as error_message
       FROM jobs WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.user.userId, limit, offset]
    );
    const [[{ total }]] = await mysql.execute(
      'SELECT COUNT(*) as total FROM jobs WHERE user_id = ?',
      [req.user.userId]
    );
    res.json({ jobs: rows, total, totalPages: Math.ceil(total / limit), currentPage: page, limit });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  try {
    const [rows] = await mysql.execute(
      'SELECT id, user_id, type, status, payload, result, created_at, updated_at FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.jobId, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = rows[0];
    if (job.payload?.videoUrl) {
      const internalUrl = job.payload.videoUrl;
      const publicMinio = process.env.PUBLIC_MINIO_ENDPOINT || 'http://localhost:9000';
      job.videoPresignedUrl = internalUrl.replace(/^http:\/\/minio:\d+/, publicMinio);
    }
    if (job.payload?.youtubeUrl) {
      job.youtubeUrl = job.payload.youtubeUrl;
    }
    res.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const [rows] = await mysql.execute(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.jobId, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    await Transcript.deleteOne({ videoId: req.params.jobId });
    await mysql.execute('DELETE FROM jobs WHERE id = ?', [req.params.jobId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Transcripts ───────────────────────────────────────────────────────────────
router.get('/transcripts/:videoId', async (req, res) => {
  try {
    // Verify ownership via jobs table
    const [rows] = await mysql.execute(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.videoId, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Transcript not found' });

    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
    res.json(transcript);
  } catch (err) {
    console.error('Get transcript error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Summary — generate + persist ──────────────────────────────────────────────
const LENGTH_MAP = {
  short:  { max: 120,  min: 40 },
  medium: { max: 300,  min: 80 },
  long:   { max: 512,  min: 150 },
};

router.post('/transcripts/:videoId/summarize', async (req, res) => {
  try {
    const [jobRows] = await mysql.execute(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.videoId, req.user.userId]
    );
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });

    const lengthKey  = LENGTH_MAP[req.body?.length] ? req.body.length : 'medium';
    const modelKey   = req.body?.model || 'led';
    const { max, min } = LENGTH_MAP[lengthKey];

    console.log(`Summarizing job ${req.params.videoId} (length=${lengthKey})…`);
    const summary = await summarize(transcript.fullText, { length: lengthKey, maxLen: max, minLen: min });

    await mysql.execute(
      'DELETE FROM summaries WHERE job_id = ? AND length = ?',
      [req.params.videoId, lengthKey]
    );
    await mysql.execute(
      'INSERT INTO summaries (job_id, user_id, length, summary, model) VALUES (?, ?, ?, ?, ?)',
      [req.params.videoId, req.user.userId, lengthKey, summary, modelKey]
    );

    res.json({ videoId: req.params.videoId, summary, length: lengthKey, model: modelKey });
  } catch (err) {
    console.error('Summarization error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Load saved summary for a job
router.get('/transcripts/:videoId/summary', async (req, res) => {
  try {
    const [rows] = await mysql.execute(
      'SELECT id, length, summary, model, created_at FROM summaries WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.videoId, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No saved summary' });
    res.json({ videoId: req.params.videoId, ...rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quiz — generate + persist ─────────────────────────────────────────────────
router.post('/transcripts/:videoId/mcq', async (req, res) => {
  try {
    const [jobRows] = await mysql.execute(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.videoId, req.user.userId]
    );
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });

    console.log(`Generating MCQs for job ${req.params.videoId}…`);
    const { mcqs, model, numQuestions } = await generateMCQ(transcript.fullText);

    // Persist quiz — replace previous quiz for this job
    await mysql.execute(
      'DELETE FROM quizzes WHERE job_id = ? AND user_id = ?',
      [req.params.videoId, req.user.userId]
    );
    const [quizResult] = await mysql.execute(
      'INSERT INTO quizzes (job_id, user_id, model) VALUES (?, ?, ?)',
      [req.params.videoId, req.user.userId, model]
    );
    const quizId = quizResult.insertId;

    for (let i = 0; i < mcqs.length; i++) {
      const q = mcqs[i];
      await mysql.execute(
        'INSERT INTO questions (quiz_id, position, question, options, correct_index, correct_answer) VALUES (?, ?, ?, ?, ?, ?)',
        [quizId, i, q.question, JSON.stringify(q.options), q.correctIndex, q.correctAnswer]
      );
    }

    res.json({ videoId: req.params.videoId, quizId, mcqs, count: mcqs.length, model });
  } catch (err) {
    console.error('MCQ generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Load saved quiz for a job
router.get('/transcripts/:videoId/quiz', async (req, res) => {
  try {
    const [quizRows] = await mysql.execute(
      'SELECT id, model, created_at FROM quizzes WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.videoId, req.user.userId]
    );
    if (quizRows.length === 0) return res.status(404).json({ error: 'No saved quiz' });

    const quiz = quizRows[0];
    const [questions] = await mysql.execute(
      'SELECT position, question, options, correct_index, correct_answer FROM questions WHERE quiz_id = ? ORDER BY position',
      [quiz.id]
    );

    const mcqs = questions.map(q => ({
      question: q.question,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      correctIndex: q.correct_index,
      correctAnswer: q.correct_answer,
    }));

    res.json({ videoId: req.params.videoId, quizId: quiz.id, mcqs, count: mcqs.length, model: quiz.model, createdAt: quiz.created_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quiz attempts ─────────────────────────────────────────────────────────────
router.post('/transcripts/:videoId/quiz/attempt', async (req, res) => {
  try {
    const [jobRows] = await mysql.execute(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.videoId, req.user.userId]
    );
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const [quizRows] = await mysql.execute(
      'SELECT id FROM quizzes WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.videoId, req.user.userId]
    );
    if (quizRows.length === 0) return res.status(404).json({ error: 'No quiz found — generate one first' });

    const quizId = quizRows[0].id;
    const [questions] = await mysql.execute(
      'SELECT position, question, options, correct_index, correct_answer FROM questions WHERE quiz_id = ? ORDER BY position',
      [quizId]
    );

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      return res.status(400).json({ error: `Expected ${questions.length} answers, got ${answers?.length ?? 0}` });
    }

    let correct = 0;
    const details = questions.map((q, i) => {
      const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      const isCorrect = answers[i] === q.correct_index;
      if (isCorrect) correct++;
      return {
        question:      q.question,
        userIndex:     answers[i],
        userAnswer:    opts[answers[i]] ?? null,
        correctIndex:  q.correct_index,
        correctAnswer: q.correct_answer,
        correct:       isCorrect,
      };
    });

    const score = (correct / questions.length) * 100;
    await mysql.execute(
      'INSERT INTO quiz_attempts (quiz_id, user_id, score, total, details, finished_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [quizId, req.user.userId, score.toFixed(2), questions.length, JSON.stringify(details)]
    );

    res.json({ score: parseFloat(score.toFixed(2)), correct, total: questions.length, details });
  } catch (err) {
    console.error('Quiz attempt error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/transcripts/:videoId/quiz/attempts', async (req, res) => {
  try {
    const [quizRows] = await mysql.execute(
      'SELECT id FROM quizzes WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.videoId, req.user.userId]
    );
    if (quizRows.length === 0) return res.json({ attempts: [] });

    const [attempts] = await mysql.execute(
      'SELECT id, score, total, finished_at, created_at FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10',
      [quizRows[0].id, req.user.userId]
    );
    res.json({ attempts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evaluation (proxy to AI service) ─────────────────────────────────────────
router.post('/evaluate/wer', async (req, res) => {
  try {
    const { hypothesis, reference } = req.body;
    if (!hypothesis || !reference) return res.status(400).json({ error: 'hypothesis and reference are required' });
    const aiRes = await fetch(`${AI_SERVICE_URL}/evaluate/wer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesis, reference }),
    });
    res.status(aiRes.status).json(await aiRes.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/evaluate/rouge', async (req, res) => {
  try {
    const { hypothesis, reference } = req.body;
    if (!hypothesis || !reference) return res.status(400).json({ error: 'hypothesis and reference are required' });
    const aiRes = await fetch(`${AI_SERVICE_URL}/evaluate/rouge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesis, reference }),
    });
    res.status(aiRes.status).json(await aiRes.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Translation ───────────────────────────────────────────────────────────────
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || !targetLang) return res.status(400).json({ error: 'text and targetLang are required' });

    const MAX_CHUNK = 4500;
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) { chunks.push(remaining); break; }
      let splitAt = remaining.lastIndexOf('. ', MAX_CHUNK);
      if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', MAX_CHUNK);
      if (splitAt === -1) splitAt = MAX_CHUNK;
      chunks.push(remaining.slice(0, splitAt + 1));
      remaining = remaining.slice(splitAt + 1);
    }

    const translatedChunks = [];
    for (const chunk of chunks) {
      const result = await translate(chunk, { to: targetLang });
      translatedChunks.push(result.text);
    }
    res.json({ translatedText: translatedChunks.join(' '), sourceLang: 'auto', targetLang });
  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed: ' + err.message });
  }
});

// ── Videos list ───────────────────────────────────────────────────────────────
router.get('/videos', async (req, res) => {
  try {
    const objects = await listObjects();
    const videos = [];
    for (const obj of objects) {
      const [rows] = await mysql.query(
        `SELECT id as job_id, status, created_at FROM jobs
         WHERE user_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.filename')) = ?
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.userId, obj.key]
      );
      videos.push({ key: obj.key, size: obj.size, lastModified: obj.lastModified, job: rows[0] || null });
    }
    res.json({ videos });
  } catch (err) {
    console.error('List videos error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
