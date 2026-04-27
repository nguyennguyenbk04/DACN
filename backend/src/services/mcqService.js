const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function generateMCQ(text, numQuestions = 5) {
  const res = await fetch(`${AI_SERVICE_URL}/mcq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, num_questions: numQuestions }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service error ${res.status}`);
  }
  const data = await res.json();
  return { mcqs: data.mcqs, model: data.model };
}

module.exports = { generateMCQ };
