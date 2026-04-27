import { useState, useEffect } from 'react';
import { api } from '../services/api';
import VideoPlayer from './VideoPlayer';
import QuizPlayer from './QuizPlayer';

const LANGUAGES = [
  { code: 'vi', label: 'Vietnamese' }, { code: 'en', label: 'English' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' }, { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja', label: 'Japanese' }, { code: 'ko', label: 'Korean' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' }, { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' }, { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' }, { code: 'th', label: 'Thai' },
  { code: 'id', label: 'Indonesian' }, { code: 'hi', label: 'Hindi' },
];

const SUMMARY_LENGTHS = [
  { value: 'short',  label: 'Short',  hint: '~60 words' },
  { value: 'medium', label: 'Medium', hint: '~130 words' },
  { value: 'long',   label: 'Long',   hint: '~250 words' },
];

export default function TranscriptViewer({ videoId, onClose }) {
  const [transcript, setTranscript]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [jobDetails, setJobDetails]     = useState(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);

  // Summary
  const [summary, setSummary]           = useState('');
  const [summaryLength, setSummaryLength] = useState('medium');
  const [summarizing, setSummarizing]   = useState(false);
  const [savedSummaryMeta, setSavedSummaryMeta] = useState(null);

  // Translation
  const [transcriptLang, setTranscriptLang]           = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [translatingTranscript, setTranslatingTranscript] = useState(false);
  const [summaryLang, setSummaryLang]                   = useState('');
  const [translatedSummary, setTranslatedSummary]       = useState('');
  const [translatingSummary, setTranslatingSummary]     = useState(false);

  // Quiz
  const [mcqs, setMcqs]               = useState([]);
  const [generatingMCQ, setGeneratingMCQ] = useState(false);
  const [numQuestions, setNumQuestions] = useState(5);
  const [savedQuizMeta, setSavedQuizMeta] = useState(null);

  // Evaluation
  const [activeEval, setActiveEval]     = useState(null); // 'wer' | 'rouge' | null
  const [evalReference, setEvalReference] = useState('');
  const [evalResult, setEvalResult]     = useState(null);
  const [evaluating, setEvaluating]     = useState(false);

  useEffect(() => {
    if (!videoId) return;
    setError('');
    loadAll();
  }, [videoId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadTranscript(), loadJobDetails(), loadSavedSummary(), loadSavedQuiz()]);
    setLoading(false);
  }

  async function loadTranscript() {
    try {
      setTranscript(await api.getTranscript(videoId));
    } catch {
      setError('Failed to load transcript');
    }
  }

  async function loadJobDetails() {
    try { setJobDetails(await api.getJob(videoId)); } catch { /* non-critical */ }
  }

  async function loadSavedSummary() {
    try {
      const data = await api.getSavedSummary(videoId);
      setSummary(data.summary);
      setSummaryLength(data.length);
      setSavedSummaryMeta({ createdAt: data.created_at });
    } catch { /* no saved summary yet */ }
  }

  async function loadSavedQuiz() {
    try {
      const data = await api.getSavedQuiz(videoId);
      setMcqs(data.mcqs || []);
      setSavedQuizMeta({ createdAt: data.createdAt, model: data.model });
    } catch { /* no saved quiz yet */ }
  }

  async function handleGenerateSummary() {
    setSummarizing(true);
    setError('');
    try {
      const data = await api.generateSummary(videoId, { length: summaryLength });
      setSummary(data.summary);
      setSavedSummaryMeta({ createdAt: new Date().toISOString() });
      setTranslatedSummary('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate summary');
    } finally {
      setSummarizing(false);
    }
  }

  async function handleTranslateTranscript() {
    if (!transcriptLang || !transcript?.fullText) return;
    setTranslatingTranscript(true);
    setTranslatedTranscript('');
    try {
      const data = await api.translateText(transcript.fullText, transcriptLang);
      setTranslatedTranscript(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTranslatingTranscript(false);
    }
  }

  async function handleTranslateSummary() {
    if (!summaryLang || !summary) return;
    setTranslatingSummary(true);
    setTranslatedSummary('');
    try {
      const data = await api.translateText(summary, summaryLang);
      setTranslatedSummary(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTranslatingSummary(false);
    }
  }

  async function handleGenerateMCQ() {
    setGeneratingMCQ(true);
    setMcqs([]);
    setError('');
    try {
      const data = await api.generateMCQ(videoId, numQuestions);
      setMcqs(data.mcqs || []);
      setSavedQuizMeta({ createdAt: new Date().toISOString(), model: data.model });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate quiz');
    } finally {
      setGeneratingMCQ(false);
    }
  }

  async function handleEvaluate() {
    if (!evalReference.trim()) return;
    setEvaluating(true);
    setEvalResult(null);
    try {
      const hypothesis = activeEval === 'wer' ? transcript?.fullText : summary;
      const fn = activeEval === 'wer' ? api.evaluateWER : api.evaluateROUGE;
      setEvalResult(await fn(hypothesis, evalReference));
    } catch (err) {
      setError(err.response?.data?.error || 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  }

  if (!videoId) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
          <span className="text-sm text-gray-500">Loading transcript…</span>
        </div>
      </div>
    );
  }

  if (error && !transcript) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={onClose} className="w-full bg-gray-200 py-2 px-4 rounded hover:bg-gray-300">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Transcript</h2>
            {jobDetails?.payload?.filename && (
              <p className="text-xs text-gray-400 mt-0.5">{jobDetails.payload.filename}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-7">

          {/* Video player */}
          {(jobDetails?.videoPresignedUrl || jobDetails?.payload?.videoUrl) && (
            <div>
              <button
                onClick={() => setShowVideoPlayer(v => !v)}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2.5 px-5 rounded-lg font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                {showVideoPlayer ? 'Hide Video Player' : 'Watch Video with Live Captions'}
              </button>
              {showVideoPlayer && (
                <div className="mt-3">
                  <VideoPlayer
                    videoUrl={jobDetails.videoPresignedUrl || jobDetails.payload.videoUrl}
                    segments={transcript?.segments || []}
                  />
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { label: 'Language', value: transcript?.language || 'N/A' },
              { label: 'Segments', value: transcript?.segments?.length ?? 0 },
              { label: 'Characters', value: transcript?.fullText?.length?.toLocaleString() ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="font-semibold text-gray-700">{value}</p>
              </div>
            ))}
          </div>

          {/* ── Summary ── */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800">AI Summary</h3>
                {savedSummaryMeta && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">saved</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {SUMMARY_LENGTHS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSummaryLength(opt.value)}
                      disabled={summarizing}
                      title={opt.hint}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                        summaryLength === opt.value
                          ? 'bg-white text-purple-700 shadow font-semibold'
                          : 'text-gray-500 hover:text-gray-700'
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleGenerateSummary}
                  disabled={summarizing}
                  className="bg-purple-600 text-white py-1.5 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                >
                  {summarizing ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
                </button>
              </div>
            </div>

            {summary ? (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-gray-800 text-sm leading-relaxed">
                {summary}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 text-center">
                No summary yet — click Generate Summary
              </div>
            )}

            {/* Translate summary */}
            {summary && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Translate:</span>
                <select
                  value={summaryLang}
                  onChange={e => setSummaryLang(e.target.value)}
                  disabled={translatingSummary}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white disabled:opacity-50"
                >
                  <option value="">— Select language —</option>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                <button
                  onClick={handleTranslateSummary}
                  disabled={!summaryLang || translatingSummary}
                  className="text-sm px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-40 transition"
                >
                  {translatingSummary ? 'Translating…' : 'Translate'}
                </button>
                {translatedSummary && (
                  <div className="w-full mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-gray-800">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded mr-2">
                      {LANGUAGES.find(l => l.code === summaryLang)?.label}
                    </span>
                    {translatedSummary}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Full transcript ── */}
          <section>
            <h3 className="text-base font-semibold text-gray-800 mb-3">Full Transcript</h3>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {transcript?.fullText || '—'}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Translate:</span>
              <select
                value={transcriptLang}
                onChange={e => setTranscriptLang(e.target.value)}
                disabled={translatingTranscript}
                className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:opacity-50"
              >
                <option value="">— Select language —</option>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <button
                onClick={handleTranslateTranscript}
                disabled={!transcriptLang || translatingTranscript}
                className="text-sm px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-40 transition"
              >
                {translatingTranscript ? 'Translating…' : 'Translate'}
              </button>
              {translatedTranscript && (
                <div className="w-full mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">
                  <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded mr-2">
                    {LANGUAGES.find(l => l.code === transcriptLang)?.label}
                  </span>
                  {translatedTranscript}
                </div>
              )}
            </div>
          </section>

          {/* ── Quiz ── */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800">Quiz (MCQ)</h3>
                {savedQuizMeta && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">saved</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={numQuestions}
                  onChange={e => setNumQuestions(Number(e.target.value))}
                  disabled={generatingMCQ}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:opacity-50"
                >
                  {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} questions</option>)}
                </select>
                <button
                  onClick={handleGenerateMCQ}
                  disabled={generatingMCQ}
                  className="bg-amber-500 text-white py-1.5 px-4 rounded-lg hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                >
                  {generatingMCQ ? 'Generating…' : mcqs.length > 0 ? 'Regenerate Quiz' : 'Generate Quiz'}
                </button>
              </div>
            </div>

            {generatingMCQ && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full flex-shrink-0" />
                Generating quiz — this may take a moment…
              </div>
            )}
            {!generatingMCQ && mcqs.length > 0 && <QuizPlayer mcqs={mcqs} videoId={videoId} />}
          </section>

          {/* ── Evaluation (academic) ── */}
          <section className="border border-dashed border-gray-300 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-gray-800">Evaluation Metrics</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">thesis</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">Compare model output against a human-written reference to measure quality.</p>

            <div className="flex gap-2 mb-4">
              {[
                { key: 'wer',   label: 'WER — Transcription', color: 'emerald' },
                { key: 'rouge', label: 'ROUGE — Summary',     color: 'purple'  },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => { setActiveEval(activeEval === key ? null : key); setEvalResult(null); setEvalReference(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    activeEval === key
                      ? `bg-${color}-600 text-white border-${color}-600`
                      : `bg-white text-gray-600 border-gray-300 hover:border-${color}-400`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeEval && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {activeEval === 'wer' ? 'Reference transcript (human-written)' : 'Reference summary (human-written)'}
                  </label>
                  <textarea
                    value={evalReference}
                    onChange={e => setEvalReference(e.target.value)}
                    rows={4}
                    placeholder="Paste the ground-truth text here…"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                </div>
                <button
                  onClick={handleEvaluate}
                  disabled={evaluating || !evalReference.trim()}
                  className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-900 disabled:opacity-40 transition"
                >
                  {evaluating ? 'Evaluating…' : 'Run Evaluation'}
                </button>

                {evalResult && (
                  <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    {activeEval === 'wer' ? (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-1">Word Error Rate (WER)</p>
                        <p className="text-3xl font-bold text-emerald-600">{evalResult.wer_percent}%</p>
                        <p className="text-xs text-gray-400 mt-1">{evalResult.interpretation}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-700 mb-2">ROUGE Scores (F1)</p>
                        {['rouge1', 'rouge2', 'rougeL'].map(key => (
                          <div key={key} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-16 text-gray-500">{key}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-purple-500 h-2 rounded-full"
                                style={{ width: `${(evalResult[key]?.f1 || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                              {((evalResult[key]?.f1 || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 mt-1">{evalResult.interpretation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Segments ── */}
          {transcript?.segments?.length > 0 && (
            <section>
              <h3 className="text-base font-semibold text-gray-800 mb-3">
                Segments <span className="text-xs font-normal text-gray-400">({transcript.segments.length})</span>
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {transcript.segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                    <span className="font-mono text-xs text-gray-400 shrink-0 pt-0.5 w-24">
                      {fmt(seg.start)} — {fmt(seg.end)}
                    </span>
                    <span className="text-gray-700">{seg.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
