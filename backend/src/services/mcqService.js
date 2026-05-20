const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const _GK = process.env.MCQ_GROQ_KEY || process.env.GROQ_API_KEY;

async function getBulletPoints(text) {
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
  const bulletText = await getBulletPoints(text);

  const bullets = bulletText
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[•\-\*]/.test(l))
    .slice(0, 15);

  console.log(`[MCQ] Groq returned ${bullets.length} bullet points — generating 1 question per bullet`);

  const results = await Promise.all(bullets.map(b => generateOneMCQ(b)));
  const mcqs = results.filter(Boolean);

  return { mcqs, model: 'leaf/t5-small-qg+distractor', numQuestions: mcqs.length };
}

module.exports = { generateMCQ };
