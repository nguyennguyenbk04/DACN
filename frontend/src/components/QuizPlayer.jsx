import { useState } from 'react';
import { api } from '../services/api';

export default function QuizPlayer({ mcqs, videoId }) {
  const [selected, setSelected]   = useState({});
  const [result, setResult]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  const allAnswered = mcqs.length > 0 && Object.keys(selected).length === mcqs.length;

  function selectOption(qIdx, oIdx) {
    if (result) return;
    setSelected(prev => ({ ...prev, [qIdx]: oIdx }));
  }

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError('');
    try {
      const answers = mcqs.map((_, i) => selected[i]);
      const data = await api.submitQuizAttempt(videoId, answers);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit attempt');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setSelected({});
    setResult(null);
    setError('');
  }

  if (mcqs.length === 0) return null;

  const scoreColor = result
    ? result.score >= 80 ? 'emerald' : result.score >= 50 ? 'amber' : 'red'
    : null;

  return (
    <div className="space-y-4">
      {/* Score banner */}
      {result && (
        <div className={`rounded-xl p-5 text-center bg-${scoreColor}-50 border border-${scoreColor}-200`}>
          <p className={`text-4xl font-bold text-${scoreColor}-600`}>
            {result.score.toFixed(0)}%
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {result.correct} / {result.total} correct
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {result.score >= 80 ? 'Excellent!' : result.score >= 50 ? 'Good effort!' : 'Keep practising!'}
          </p>
        </div>
      )}

      {/* Questions */}
      {mcqs.map((q, qIdx) => {
        const detail = result?.details?.[qIdx];
        return (
          <div key={qIdx} className="border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-800 mb-3">
              <span className="text-amber-600 font-bold mr-1.5">{qIdx + 1}.</span>
              {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oIdx) => {
                const isSelected = selected[qIdx] === oIdx;
                const isCorrect  = result != null && oIdx === q.correctIndex;
                const isWrong    = result != null && isSelected && oIdx !== q.correctIndex;

                return (
                  <button
                    key={oIdx}
                    onClick={() => selectOption(qIdx, oIdx)}
                    className={`w-full text-left text-sm px-4 py-2.5 rounded-lg border transition-all
                      ${isCorrect  ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-medium' :
                        isWrong    ? 'bg-red-50 border-red-400 text-red-800' :
                        isSelected ? 'bg-amber-50 border-amber-400 text-amber-800' :
                                     'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}
                      ${result ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <span className="flex items-center gap-2">
                      {result && isCorrect && (
                        <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {result && isWrong && (
                        <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            {detail && !detail.correct && (
              <p className="text-xs text-gray-500 mt-2">
                Correct answer: <span className="text-emerald-600 font-medium">{detail.correctAnswer}</span>
              </p>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {!result ? (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="bg-amber-500 text-white py-2 px-6 rounded-lg hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {submitting ? 'Submitting…' : `Submit (${Object.keys(selected).length}/${mcqs.length} answered)`}
          </button>
        ) : (
          <button
            onClick={handleRetry}
            className="border border-gray-300 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
          >
            Try Again
          </button>
        )}
        {!allAnswered && !result && (
          <span className="text-xs text-gray-400">Answer all questions to submit</span>
        )}
      </div>
    </div>
  );
}
