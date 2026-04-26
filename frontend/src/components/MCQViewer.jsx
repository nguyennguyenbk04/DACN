import { useState } from 'react';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function MCQViewer({ mcqs }) {
  const [selected, setSelected] = useState({}); // { [questionIndex]: optionIndex }
  const [revealed, setRevealed] = useState({}); // { [questionIndex]: true }
  const [showScore, setShowScore] = useState(false);

  if (!mcqs || mcqs.length === 0) return null;

  const handleSelect = (qIdx, oIdx) => {
    if (revealed[qIdx]) return; // locked after reveal
    setSelected((prev) => ({ ...prev, [qIdx]: oIdx }));
  };

  const handleReveal = (qIdx) => {
    if (selected[qIdx] === undefined) return;
    setRevealed((prev) => ({ ...prev, [qIdx]: true }));
  };

  const handleRevealAll = () => {
    const all = {};
    mcqs.forEach((_, i) => { all[i] = true; });
    setRevealed(all);
    setShowScore(true);
  };

  const handleReset = () => {
    setSelected({});
    setRevealed({});
    setShowScore(false);
  };

  const answeredCount = Object.keys(selected).length;
  const correctCount = mcqs.filter(
    (q, i) => revealed[i] && selected[i] === q.correctIndex
  ).length;
  const revealedCount = Object.keys(revealed).length;

  return (
    <div className="space-y-5">
      {/* Score bar */}
      {showScore && (
        <div className={`p-4 rounded-lg flex items-center justify-between ${
          correctCount / mcqs.length >= 0.7
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div>
            <p className="font-semibold text-gray-800">
              Score: {correctCount} / {mcqs.length}
            </p>
            <p className="text-sm text-gray-500">
              {Math.round((correctCount / mcqs.length) * 100)}% correct
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-sm px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Questions */}
      {mcqs.map((mcq, qIdx) => {
        const isRevealed = !!revealed[qIdx];
        const userChoice = selected[qIdx];

        return (
          <div key={qIdx} className="border border-gray-200 rounded-xl p-5 bg-white">
            {/* Question */}
            <p className="font-medium text-gray-800 mb-4">
              <span className="text-amber-600 font-bold mr-2">Q{qIdx + 1}.</span>
              {mcq.question}
            </p>

            {/* Options */}
            <div className="space-y-2">
              {mcq.options.map((opt, oIdx) => {
                const isSelected  = userChoice === oIdx;
                const isCorrect   = mcq.correctIndex === oIdx;

                let optClass = 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100';

                if (isRevealed) {
                  if (isCorrect) {
                    optClass = 'border border-emerald-400 bg-emerald-50 text-emerald-800 font-medium';
                  } else if (isSelected && !isCorrect) {
                    optClass = 'border border-red-400 bg-red-50 text-red-700 line-through';
                  } else {
                    optClass = 'border border-gray-200 bg-gray-50 text-gray-400';
                  }
                } else if (isSelected) {
                  optClass = 'border border-blue-400 bg-blue-50 text-blue-800 font-medium';
                }

                return (
                  <button
                    key={oIdx}
                    onClick={() => handleSelect(qIdx, oIdx)}
                    disabled={isRevealed}
                    className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition flex items-center gap-3 ${optClass}`}
                  >
                    <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
                      isRevealed && isCorrect
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isSelected && !isRevealed
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 text-gray-500'
                    }`}>
                      {OPTION_LABELS[oIdx]}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {isRevealed && isCorrect && (
                      <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isRevealed && isSelected && !isCorrect && (
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Check button */}
            {!isRevealed && (
              <button
                onClick={() => handleReveal(qIdx)}
                disabled={userChoice === undefined}
                className="mt-3 text-sm px-4 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Check answer
              </button>
            )}
          </div>
        );
      })}

      {/* Footer actions */}
      <div className="flex gap-3 pt-1">
        {revealedCount < mcqs.length && (
          <button
            onClick={handleRevealAll}
            disabled={answeredCount === 0}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Submit all & see score
          </button>
        )}
        {revealedCount > 0 && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
