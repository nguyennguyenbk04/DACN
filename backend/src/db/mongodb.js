const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function connectMongo(opts = {}) {
  const uri = process.env.MONGODB_URI || `mongodb://127.0.0.1:${process.env.MONGODB_PORT || 27017}`;
  const dbName = process.env.MONGODB_NAME || process.env.MONGODB_DATABASE || 'appdb';
  const defaultOpts = {
    dbName,
    autoIndex: true,
    // shorter server selection timeout so failures surface quickly in dev
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  };
  const cfg = Object.assign({}, defaultOpts, opts);

  // retry loop for transient startup ordering issues
  const maxAttempts = Number(process.env.MONGODB_CONNECT_ATTEMPTS || 5);
  const baseDelay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri, cfg);
      console.log('Connected to MongoDB', uri, 'db:', dbName);
      return;
    } catch (err) {
      console.warn(`MongoDB connect attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}

module.exports = { connectMongo, mongoose };
