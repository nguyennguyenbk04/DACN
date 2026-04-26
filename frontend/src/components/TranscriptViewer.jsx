import { useState, useEffect } from 'react';
import { api } from '../services/api';
import VideoPlayer from './VideoPlayer';
import MCQViewer from './MCQViewer';

const LANGUAGES = [
  { code: 'vi', label: 'Vietnamese' },
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'th', label: 'Thai' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'cs', label: 'Czech' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
];

const SUMMARY_LENGTHS = [
  { value: 'short',  label: 'Short',  hint: '~60 words' },
  { value: 'medium', label: 'Medium', hint: '~130 words' },
  { value: 'long',   label: 'Long',   hint: '~250 words' },
];

export default function TranscriptViewer({ videoId, onClose }) {
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryLength, setSummaryLength] = useState('medium');
  const [jobDetails, setJobDetails] = useState(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);

  // Translation state
  const [transcriptLang, setTranscriptLang] = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [translatingTranscript, setTranslatingTranscript] = useState(false);
  const [summaryLang, setSummaryLang] = useState('');
  const [translatedSummary, setTranslatedSummary] = useState('');
  const [translatingSummary, setTranslatingSummary] = useState(false);

  // MCQ state
  const [mcqs, setMcqs] = useState([]);
  const [generatingMCQ, setGeneratingMCQ] = useState(false);
  const [numQuestions, setNumQuestions] = useState(5);

  useEffect(() => {
    if (videoId) {
      loadTranscript();
      loadJobDetails();
    }
  }, [videoId]);

  const loadTranscript = async () => {
    try {
      setLoading(true);
      const data = await api.getTranscript(videoId);
      setTranscript(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load transcript');
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async () => {
    try {
      const data = await api.getJob(videoId);
      setJobDetails(data);
    } catch (err) {
      console.error('Failed to load job details:', err);
    }
  };

  const handleGenerateSummary = async () => {
    try {
      setSummarizing(true);
      const data = await api.generateSummary(videoId, { length: summaryLength });
      setSummary(data.summary);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate summary');
    } finally {
      setSummarizing(false);
    }
  };

  const handleTranslateTranscript = async (lang) => {
    if (!lang || !transcript?.fullText) return;
    setTranscriptLang(lang);
    setTranslatingTranscript(true);
    setTranslatedTranscript('');
    try {
      const data = await api.translateText(transcript.fullText, lang);
      setTranslatedTranscript(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTranslatingTranscript(false);
    }
  };

  const handleTranslateSummary = async (lang) => {
    if (!lang || !summary) return;
    setSummaryLang(lang);
    setTranslatingSummary(true);
    setTranslatedSummary('');
    try {
      const data = await api.translateText(summary, lang);
      setTranslatedSummary(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTranslatingSummary(false);
    }
  };

  const handleGenerateMCQ = async () => {
    try {
      setGeneratingMCQ(true);
      setMcqs([]);
      const data = await api.generateMCQ(videoId, numQuestions);
      setMcqs(data.mcqs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate MCQs');
    } finally {
      setGeneratingMCQ(false);
    }
  };

  if (!videoId) {
    return null;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">Loading transcript...</div>
        </div>
      </div>
    );
  }

  if (error && !transcript) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 py-2 px-4 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Transcript</h2>
            {jobDetails && (
              <p className="text-sm text-gray-500 mt-1">{jobDetails.payload?.filename}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Video Player Toggle Button */}
          {(jobDetails?.videoPresignedUrl || jobDetails?.payload?.videoUrl) && (
            <div className="mb-6">
              <button
                onClick={() => setShowVideoPlayer(!showVideoPlayer)}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {showVideoPlayer ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Hide Video Player
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Watch Video with Live Captions
                  </>
                )}
              </button>
            </div>
          )}

          {/* Video Player with Live Captions */}
          {showVideoPlayer && (jobDetails?.videoPresignedUrl || jobDetails?.payload?.videoUrl) && (
            <div className="mb-8">
              <VideoPlayer
                videoUrl={jobDetails.videoPresignedUrl || jobDetails.payload.videoUrl}
                segments={transcript.segments || []}
              />
            </div>
          )}

          {/* Metadata */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Video ID:</strong> {transcript.videoId}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Language:</strong> {transcript.language || 'N/A'}
            </p>
            {transcript.segments && (
              <p className="text-sm text-gray-600 mt-1">
                <strong>Segments:</strong> {transcript.segments.length}
              </p>
            )}
          </div>

          {/* Summary Section */}
          <div className="mb-6">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
              <h3 className="text-lg font-semibold text-gray-800">AI Summary</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Length selector */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {SUMMARY_LENGTHS.map((opt) => (
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
                  className="bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {summarizing ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
                </button>
              </div>
            </div>
            
            {summary && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-gray-800">{summary}</p>
              </div>
            )}

            {/* Translate Summary */}
            {summary && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 whitespace-nowrap">Translate summary:</span>
                  <select
                    value={summaryLang}
                    onChange={(e) => e.target.value && handleTranslateSummary(e.target.value)}
                    disabled={translatingSummary}
                    className="flex-1 max-w-xs text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50 bg-white"
                  >
                    <option value="">— Select language —</option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}</option>
                    ))}
                  </select>
                </div>
                {translatingSummary && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                    Translating…
                  </div>
                )}
                {translatedSummary && (
                  <div className="mt-2 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                        {LANGUAGES.find(l => l.code === summaryLang)?.label}
                      </span>
                    </div>
                    <p className="text-gray-800">{translatedSummary}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Full Text */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Full Transcript</h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-800 whitespace-pre-wrap">{transcript.fullText}</p>
            </div>

            {/* Translate Transcript */}
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">Translate transcript:</span>
                <select
                  value={transcriptLang}
                  onChange={(e) => e.target.value && handleTranslateTranscript(e.target.value)}
                  disabled={translatingTranscript}
                  className="flex-1 max-w-xs text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 bg-white"
                >
                  <option value="">— Select language —</option>
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </div>
              {translatingTranscript && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                  <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                  Translating…
                </div>
              )}
              {translatedTranscript && (
                <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                      {LANGUAGES.find(l => l.code === transcriptLang)?.label}
                    </span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{translatedTranscript}</p>
                </div>
              )}
            </div>
          </div>

          {/* MCQ Section */}
          <div className="mb-6">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Quiz (MCQ)</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Questions:</label>
                  <select
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    disabled={generatingMCQ}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:opacity-50"
                  >
                    {[3, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleGenerateMCQ}
                  disabled={generatingMCQ}
                  className="bg-amber-500 text-white py-2 px-4 rounded hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {generatingMCQ ? 'Generating…' : mcqs.length > 0 ? 'Regenerate Quiz' : 'Generate Quiz'}
                </button>
              </div>
            </div>

            {generatingMCQ && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full flex-shrink-0"></div>
                Generating quiz questions — this may take 1–2 minutes on first run (model loading)…
              </div>
            )}

            {!generatingMCQ && mcqs.length > 0 && (
              <MCQViewer mcqs={mcqs} />
            )}
          </div>

          {/* Segments */}
          {transcript.segments && transcript.segments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Segments</h3>
              <div className="space-y-2">
                {transcript.segments.map((segment, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-mono text-gray-500 mt-1 min-w-[100px]">
                        {formatTime(segment.start)} - {formatTime(segment.end)}
                      </span>
                      <p className="text-gray-800 flex-1">{segment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
