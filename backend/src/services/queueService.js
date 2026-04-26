const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const dotenv = require('dotenv');
dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || `redis://127.0.0.1:${process.env.REDIS_PORT || 6379}`);
const q = new Queue('transcribe', { connection });

async function enqueueTranscription(data) {
  return q.add('transcribe', data);
}

module.exports = { enqueueTranscription };
