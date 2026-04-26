const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const dotenv = require('dotenv');
dotenv.config();

const endpoint = process.env.MINIO_ENDPOINT || `http://127.0.0.1:${process.env.MINIO_API_PORT || 9000}`;
const region = process.env.MINIO_REGION || 'us-east-1';
const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';
const bucket = process.env.MINIO_BUCKET || 'dacn-videos';

const s3 = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: true
});

async function uploadLocalFile(localPath, name) {
  const body = fs.readFileSync(localPath);
  const key = path.basename(name);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'video/mp4' }));
  return `${endpoint}/${bucket}/${encodeURIComponent(key)}`;
}

module.exports = { uploadLocalFile };

async function downloadToFile(keyOrUrl, destPath) {
  // Accept either a full MinIO URL (http://endpoint/bucket/key) or an object key
  let key = keyOrUrl;
  // if url contains endpoint and bucket, extract key
  try {
    const url = new URL(keyOrUrl);
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) {
      key = decodeURIComponent(url.pathname.slice(prefix.length));
    }
  } catch (e) {
    // not a URL, assume key
  }

  const out = require('fs').createWriteStream(destPath);
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = res.Body;
  await new Promise((resolve, reject) => {
    stream.pipe(out);
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return destPath;
}

/**
 * Generate a presigned URL for accessing a file in MinIO
 * @param {string} keyOrUrl - Object key or full MinIO URL
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 */
async function getPresignedUrl(keyOrUrl, expiresIn = 3600) {
  let key = keyOrUrl;
  
  // Extract key from URL if full URL is provided
  try {
    const url = new URL(keyOrUrl);
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) {
      key = decodeURIComponent(url.pathname.slice(prefix.length));
    }
  } catch (e) {
    // not a URL, assume it's already a key
  }

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn });
  
  return presignedUrl;
}

/**
 * List all objects in the MinIO bucket
 */
async function listObjects(prefix = '') {
  const params = { Bucket: bucket };
  if (prefix) params.Prefix = prefix;

  const result = await s3.send(new ListObjectsV2Command(params));
  const objects = (result.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
  // Sort newest first
  objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return objects;
}

module.exports = { uploadLocalFile, downloadToFile, getPresignedUrl, listObjects };
