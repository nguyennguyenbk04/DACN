const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function summarizeWithPegasus(text, maxLen = 150, minLen = 40) {
  const res = await fetch(`${AI_SERVICE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, max_length: maxLen, min_length: minLen }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service error ${res.status}`);
  }
  const data = await res.json();
  return data.summary;
}

module.exports = { summarizeWithPegasus };
