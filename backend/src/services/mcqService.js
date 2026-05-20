const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const _GK = process.env.MCQ_GROQ_KEY || process.env.GROQ_API_KEY;

async function getBulletPoints(text) {
  if (!_GK) throw new Error('No Groq API key configured');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_GK}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Extract key facts from the text as bullet points. Each bullet must:
- Start with "• "
- Be a single, short declarative sentence (under 25 words)
- Contain exactly one specific, concrete fact with a clear answerable detail (a name, number, date, place, or definition)
- Be phrased like a factual statement from an encyclopedia or textbook — not vague, not a summary sentence
- Avoid introductory phrases, section headers, or conclusions

Good example: "• The Eiffel Tower was completed in 1889 and stands 330 metres tall."
Bad example: "• The text discusses various aspects of the Eiffel Tower's history."

Text:\n${text}`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// Fallback: use LED to summarize then split into sentences as pseudo-bullets
async function getBulletsViaLED(text) {
  const res = await fetch(`${AI_SERVICE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, max_length: 300, min_length: 80 }),
  });
  if (!res.ok) throw new Error('LED summarization failed');
  const data = await res.json();
  const summary = data.summary || '';
  // Split into sentences and treat each as a bullet
  return summary
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

async function generateOneMCQ(bullet) {
  const res = await fetch(`${AI_SERVICE_URL}/mcq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: bullet, num_questions: 1 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service error ${res.status}`);
  }
  const data = await res.json();
  return data.mcqs[0] || null;
}

async function generateMCQ(text) {
  let bullets = [];
  let usedFallback = false;

  try {
    const bulletText = await getBulletPoints(text);
    bullets = bulletText
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^[•\-\*]/.test(l))
      .slice(0, 15);

    if (bullets.length === 0) throw new Error('No bullets parsed from Groq response');
    console.log(`[MCQ] Groq returned ${bullets.length} bullet points`);
  } catch (err) {
    console.warn(`[MCQ] Groq failed (${err.message}) — falling back to LED`);
    usedFallback = true;
    try {
      bullets = (await getBulletsViaLED(text)).slice(0, 10);
      console.log(`[MCQ] LED fallback produced ${bullets.length} sentences`);
    } catch (ledErr) {
      console.error(`[MCQ] LED fallback also failed: ${ledErr.message}`);
      // Last resort: chunk the raw transcript
      bullets = text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 30)
        .slice(0, 8);
    }
  }

  if (bullets.length === 0) throw new Error('Could not extract content to generate questions from');

  console.log(`[MCQ] Generating 1 question per bullet (${bullets.length} total, fallback=${usedFallback})`);
  const results = await Promise.all(bullets.map(b => generateOneMCQ(b)));
  const mcqs = results.filter(Boolean);

  return { mcqs, model: usedFallback ? 'leaf/t5-small-qg+distractor (LED fallback)' : 'leaf/t5-small-qg+distractor', numQuestions: mcqs.length };
}

module.exports = { generateMCQ };
