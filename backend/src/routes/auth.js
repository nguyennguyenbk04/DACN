const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db/mysql');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const JWT_EXPIRES_IN = '7d';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email, passwordHash, name || null]
    );
    const userId = result.insertId;
    const token = jwt.sign({ userId, email, role: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: userId, email, name: name || null, role: 'user' } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const [rows] = await pool.execute(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Invalid or expired token' });
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ── Update profile (name / password) ─────────────────────────────────────────
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const { name, currentPassword, newPassword } = req.body;

    const [rows] = await pool.execute('SELECT id, password_hash FROM users WHERE id = ?', [decoded.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
      updates.push('password_hash = ?');
      params.push(await bcrypt.hash(newPassword, 10));
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(decoded.userId);
    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.execute('SELECT id, email, name, role FROM users WHERE id = ?', [decoded.userId]);
    res.json({ user: updated[0] });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Invalid token' });
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── Delete account ────────────────────────────────────────────────────────────
router.delete('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    await pool.execute('DELETE FROM users WHERE id = ?', [decoded.userId]);
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Invalid token' });
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── Learning stats ────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const uid = decoded.userId;

    const [[{ totalVideos }]]   = await pool.execute("SELECT COUNT(*) as totalVideos FROM jobs WHERE user_id = ? AND status = 'completed'", [uid]);
    const [[{ totalQuizzes }]]  = await pool.execute('SELECT COUNT(*) as totalQuizzes FROM quiz_attempts WHERE user_id = ?', [uid]);
    const [[{ avgScore }]]      = await pool.execute('SELECT ROUND(AVG(score), 1) as avgScore FROM quiz_attempts WHERE user_id = ?', [uid]);

    // Activity: uploads + quiz attempts per day for last 30 days
    const [uploadActivity] = await pool.execute(
      "SELECT DATE(created_at) as date, COUNT(*) as count FROM jobs WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at)",
      [uid]
    );
    const [quizActivity] = await pool.execute(
      'SELECT DATE(created_at) as date, COUNT(*) as count FROM quiz_attempts WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at)',
      [uid]
    );

    // Streak: consecutive days with quiz activity ending today or yesterday
    const [attemptDays] = await pool.execute(
      'SELECT DISTINCT DATE(created_at) as d FROM quiz_attempts WHERE user_id = ? ORDER BY d DESC',
      [uid]
    );
    let streak = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = 0; i < attemptDays.length; i++) {
      const d = new Date(attemptDays[i].d); d.setHours(0,0,0,0);
      const expected = new Date(today); expected.setDate(today.getDate() - i);
      if (d.getTime() === expected.getTime()) streak++;
      else break;
    }

    res.json({ totalVideos, totalQuizzes, avgScore: avgScore || 0, streak, uploadActivity, quizActivity });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── Quiz performance per video ────────────────────────────────────────────────
router.get('/performance', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const uid = decoded.userId;

    const [rows] = await pool.execute(`
      SELECT
        j.id                                              AS jobId,
        JSON_UNQUOTE(JSON_EXTRACT(j.payload, '$.filename')) AS filename,
        ROUND(AVG(qa.score), 1)                           AS avgScore,
        MAX(qa.score)                                     AS bestScore,
        COUNT(qa.id)                                      AS attempts,
        MAX(qa.created_at)                                AS lastAttempt
      FROM jobs j
      JOIN quizzes q   ON q.job_id  = j.id
      JOIN quiz_attempts qa ON qa.quiz_id = q.id
      WHERE j.user_id = ? AND qa.user_id = ?
      GROUP BY j.id, filename
      ORDER BY avgScore ASC
    `, [uid, uid]);

    res.json({ videos: rows });
  } catch (err) {
    console.error('Performance error:', err);
    res.status(500).json({ error: 'Failed to load performance' });
  }
});

module.exports = router;
