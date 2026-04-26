const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const { connectMongo } = require('./db/mongodb');
const pool = require('./db/mysql');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

async function start() {
  // Connect to MongoDB
  try { await connectMongo(); } catch (e) { console.warn('Mongo connect failed', e.message); }

  // Test MySQL connection
  try { const conn = await pool.getConnection(); conn.release(); console.log('MySQL connected'); } catch (e) { console.warn('MySQL connect failed', e.message); }

  const app = express();
  
  // Enable CORS for frontend
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  app.use(express.json());
  app.use('/api/auth', authRouter);        // public: login & register
  app.use('/api', authMiddleware, apiRouter); // protected: everything else

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}

start().catch(err => { console.error(err); process.exit(1); });
