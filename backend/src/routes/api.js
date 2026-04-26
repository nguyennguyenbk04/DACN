const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadLocalFile, getPresignedUrl, listObjects } = require('../services/storage');
const { enqueueTranscription } = require('../services/queueService');
const fs = require('fs');
const mysql = require('../db/mysql');
const Transcript = require('../models/transcript');
const { summarizeWithPegasus } = require('../services/summarizerService');
const { generateMCQ } = require('../services/mcqService');
const translate = require('@vitalets/google-translate-api').translate;

const router = express.Router();

// Ensure upload directory exists
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

router.get('/health', (req, res) => res.json({ ok: true }));

router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no file' });

    // upload to MinIO
    const url = await uploadLocalFile(file.path, file.originalname);

    // enqueue transcription job (store url and filename)
    const job = await enqueueTranscription({ videoUrl: url, filename: file.originalname });

    // cleanup tmp file
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }

    res.json({ jobId: job.id, videoId: job.id, url });
  } catch (err) {
    console.error('upload error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get job status by job ID
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const [rows] = await mysql.execute(
      'SELECT id, video_id, type, status, payload, result, created_at, updated_at FROM jobs WHERE id = ?',
      [req.params.jobId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = rows[0];
    
    // Generate presigned URL for video if it exists
    if (job.payload && job.payload.videoUrl) {
      try {
        const presignedUrl = await getPresignedUrl(job.payload.videoUrl, 7200); // 2 hours
        job.videoPresignedUrl = presignedUrl;
      } catch (err) {
        console.warn('Failed to generate presigned URL:', err.message);
      }
    }
    
    res.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get transcript by video ID (job ID)
router.get('/transcripts/:videoId', async (req, res) => {
  try {
    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    res.json(transcript);
  } catch (err) {
    console.error('Get transcript error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all jobs (with pagination)
router.get('/jobs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get jobs with proper columns
    const [rows] = await mysql.query(
      `SELECT id as job_id, video_id, type, status, created_at, updated_at, 
              JSON_UNQUOTE(JSON_EXTRACT(payload, '$.filename')) as filename,
              JSON_UNQUOTE(JSON_EXTRACT(result, '$.error')) as error_message
       FROM jobs 
       ORDER BY created_at DESC 
       LIMIT ${limit} OFFSET ${offset}`
    );
    
    const [countResult] = await mysql.execute('SELECT COUNT(*) as total FROM jobs');
    const total = countResult[0].total;
    
    res.json({
      jobs: rows,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a job by ID
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    
    // Get job details first to delete transcript if exists
    const [jobRows] = await mysql.execute('SELECT id FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Delete transcript from MongoDB if exists
    await Transcript.deleteOne({ videoId: jobId });
    
    // Delete job from MySQL
    await mysql.execute('DELETE FROM jobs WHERE id = ?', [jobId]);
    
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate summary for a transcript using trained Pegasus model
router.post('/transcripts/:videoId/summarize', async (req, res) => {
  try {
    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Map length preset to max/min token counts
    const LENGTH_MAP = {
      short:  { max: 80,  min: 30 },
      medium: { max: 150, min: 50 },
      long:   { max: 280, min: 100 },
    };
    const preset = LENGTH_MAP[req.body?.length] || LENGTH_MAP.medium;

    console.log(`Generating summary for video ${req.params.videoId} (length=${req.body?.length || 'medium'})...`);
    const summary = await summarizeWithPegasus(transcript.fullText, preset.max, preset.min);
    
    res.json({
      videoId: req.params.videoId,
      summary,
      method: 'pegasus-trained',
      originalLength: transcript.fullText.length,
      summaryLength: summary.length
    });
  } catch (err) {
    console.error('Summarization error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate MCQs from a transcript
router.post('/transcripts/:videoId/mcq', async (req, res) => {
  try {
    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const numQuestions = Math.min(parseInt(req.body?.numQuestions) || 5, 15);

    console.log(`Generating ${numQuestions} MCQs for video ${req.params.videoId}...`);
    const mcqs = await generateMCQ(transcript.fullText, numQuestions);

    res.json({
      videoId: req.params.videoId,
      mcqs,
      count: mcqs.length,
    });
  } catch (err) {
    console.error('MCQ generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Translate text
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: 'text and targetLang are required' });
    }

    // Split long text into chunks (Google Translate has a ~5000 char limit)
    const MAX_CHUNK = 4500;
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }
      // find last sentence break before limit
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

    res.json({
      translatedText: translatedChunks.join(' '),
      sourceLang: 'auto',
      targetLang,
    });
  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed: ' + err.message });
  }
});

// List uploaded videos from MinIO
router.get('/videos', async (req, res) => {
  try {
    const objects = await listObjects();

    // Enrich with job status from MySQL
    const videos = [];
    for (const obj of objects) {
      let jobInfo = null;
      try {
        const [rows] = await mysql.query(
          `SELECT id as job_id, status, created_at FROM jobs 
           WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.filename')) = ? 
           ORDER BY created_at DESC LIMIT 1`,
          [obj.key]
        );
        if (rows.length > 0) jobInfo = rows[0];
      } catch (e) { /* ignore */ }

      videos.push({
        key: obj.key,
        size: obj.size,
        lastModified: obj.lastModified,
        job: jobInfo,
      });
    }

    res.json({ videos });
  } catch (err) {
    console.error('List videos error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
