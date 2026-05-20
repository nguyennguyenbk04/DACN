const express = require('express');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
dotenv.config();

const { connectMongo } = require('./db/mongodb');
const pool = require('./db/mysql');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

async function start() {
  try { await connectMongo(); } catch (e) { console.warn('Mongo connect failed', e.message); }
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('MySQL connected');
  } catch (e) { console.warn('MySQL connect failed', e.message); }

  const app = express();

  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-groq-key, x-openai-key, x-anthropic-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.use(express.json());

  // Global rate limit: 200 req / 15 min per IP
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));

  app.use('/api/auth', authRouter);
  app.use('/api', authMiddleware, apiRouter);

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}

start().catch(err => { console.error(err); process.exit(1); });
