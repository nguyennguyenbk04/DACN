const AI_SERVICE_URL    = process.env.AI_SERVICE_URL    || 'http://localhost:8000';
const GROQ_API_KEY      = process.env.GROQ_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function buildPrompt(text, length) {
  const guide = {
    short:  'a concise summary of 2–3 sentences (~60 words)',
    medium: 'a clear summary of 4–6 sentences (~130 words)',
    long:   'a detailed summary of 8–10 sentences (~250 words)',
  }[length] || 'a clear summary of 4–6 sentences';

  return `Summarize the following transcript into ${guide}. Focus on the main topics and key takeaways. Write in clear, informative prose without filler phrases.\n\nTranscript:\n${text}`;
}

async function summarizeWithLED(text, maxLen = 300, minLen = 80) {
  const res = await fetch(`${AI_SERVICE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, max_length: maxLen, min_length: minLen }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service error ${res.status}`);
  }
  return (await res.json()).summary;
}

async function summarizeWithGroq(text, length, modelName, apiKey = GROQ_API_KEY) {
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: buildPrompt(text, length) }],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${res.status}`);
  }
  return (await res.json()).choices[0].message.content.trim();
}

async function summarizeWithOpenAI(text, length, modelName, apiKey = OPENAI_API_KEY) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: buildPrompt(text, length) }],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error ${res.status}`);
  }
  return (await res.json()).choices[0].message.content.trim();
}

async function summarizeWithClaude(text, length, modelName, apiKey = ANTHROPIC_API_KEY) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 600,
      messages: [{ role: 'user', content: buildPrompt(text, length) }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${res.status}`);
  }
  return (await res.json()).content[0].text.trim();
}

async function summarize(text, { length = 'medium', model = 'led', maxLen, minLen, apiKeys = {} } = {}) {
  if (model === 'led') return summarizeWithLED(text, maxLen, minLen);

  const slash = model.indexOf('/');
  if (slash === -1) throw new Error(`Unknown model format: ${model}`);
  const provider  = model.slice(0, slash);
  const modelName = model.slice(slash + 1);

  if (provider === 'groq')    return summarizeWithGroq(text, length, modelName, apiKeys.groq || GROQ_API_KEY);
  if (provider === 'openai')  return summarizeWithOpenAI(text, length, modelName, apiKeys.openai || OPENAI_API_KEY);
  if (provider === 'claude')  return summarizeWithClaude(text, length, modelName, apiKeys.claude || ANTHROPIC_API_KEY);

  throw new Error(`Unknown summarization provider: ${provider}`);
}

// Keep old export name so nothing else breaks
module.exports = { summarize, summarizeWithPegasus: summarizeWithLED };
