const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const dotenv = require('dotenv');
dotenv.config();

const endpoint       = process.env.MINIO_ENDPOINT || `http://127.0.0.1:${process.env.MINIO_API_PORT || 9000}`;
const publicEndpoint = process.env.PUBLIC_MINIO_ENDPOINT || endpoint;
const region    = process.env.MINIO_REGION || 'us-east-1';
const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';
const bucket    = process.env.MINIO_BUCKET || 'dacn-videos';

const s3 = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: true,
});

async function uploadLocalFile(localPath, name) {
  const body = fs.readFileSync(localPath);
  const key  = path.basename(name);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'video/mp4' }));
  return `${endpoint}/${bucket}/${encodeURIComponent(key)}`;
}

async function downloadToFile(keyOrUrl, destPath) {
  let key = keyOrUrl;
  try {
    const url = new URL(keyOrUrl);
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) key = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch (_) { /* already a key */ }

  const out = fs.createWriteStream(destPath);
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await new Promise((resolve, reject) => {
    res.Body.pipe(out);
    res.Body.on('end', resolve);
    res.Body.on('error', reject);
  });
  return destPath;
}

async function getPresignedUrl(keyOrUrl, expiresIn = 3600) {
  let key = keyOrUrl;
  try {
    const url = new URL(keyOrUrl);
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) key = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch (_) { /* already a key */ }

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  // Rewrite internal Docker hostname to public-facing endpoint for browser access
  return url.replace(endpoint, publicEndpoint);
}

async function listObjects(prefix = '') {
  const params = { Bucket: bucket };
  if (prefix) params.Prefix = prefix;
  const result = await s3.send(new ListObjectsV2Command(params));
  return (result.Contents || [])
    .map(obj => ({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified }))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

module.exports = { uploadLocalFile, downloadToFile, getPresignedUrl, listObjects };
