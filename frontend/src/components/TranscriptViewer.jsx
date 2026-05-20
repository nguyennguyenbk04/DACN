import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import VideoPlayer from './VideoPlayer';
import QuizPlayer from './QuizPlayer';

const WHISPER_MODELS = [
  { value: 'tiny',   label: 'Tiny',   hint: 'Fastest, least accurate' },
  { value: 'base',   label: 'Base',   hint: 'Balanced (default)' },
  { value: 'small',  label: 'Small',  hint: 'Good accuracy' },
  { value: 'medium', label: 'Medium', hint: 'High accuracy, slower' },
  { value: 'large',  label: 'Large',  hint: 'Best accuracy, slowest' },
];

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


const TABS = [
  { id: 'video',      label: 'Video' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'summary',    label: 'Summary' },
  { id: 'mcqs',       label: 'MCQs' },
  { id: 'settings',   label: 'Settings' },
];

export default function TranscriptViewer({ videoId, onClose }) {
  const [jobDetails, setJobDetails]   = useState(null);
  const [transcript, setTranscript]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState('video');

  // Video
  const videoPlayerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Transcription trigger
  const [whisperModel, setWhisperModel]       = useState('base');
  const [startingTranscription, setStartingTranscription] = useState(false);

  // Summary
  const [summary, setSummary]               = useState('');
  const [summaryLength, setSummaryLength]   = useState('medium');
  const [summarizing, setSummarizing]       = useState(false);
  const [savedSummaryMeta, setSavedSummaryMeta] = useState(null);

  // Translation
  const [transcriptLang, setTranscriptLang]               = useState('');
  const [translatedTranscript, setTranslatedTranscript]   = useState('');
  const [translatingTranscript, setTranslatingTranscript] = useState(false);
  const [summaryLang, setSummaryLang]                     = useState('');
  const [translatedSummary, setTranslatedSummary]         = useState('');
  const [translatingSummary, setTranslatingSummary]       = useState(false);

  // Quiz
  const [mcqs, setMcqs]                   = useState([]);
  const [generatingMCQ, setGeneratingMCQ] = useState(false);
  const [savedQuizMeta, setSavedQuizMeta] = useState(null);

  // Evaluation
  const [activeEval, setActiveEval]       = useState(null);
  const [evalReference, setEvalReference] = useState('');
  const [evalResult, setEvalResult]       = useState(null);
  const [evaluating, setEvaluating]       = useState(false);

  useEffect(() => {
    if (!videoId) return;
    setError(''); setActiveTab('video'); setTranscript(null);
    loadAll();
  }, [videoId]);

  // Auto-poll while transcription is in progress
  useEffect(() => {
    const status = jobDetails?.status;
    if (status !== 'queued' && status !== 'running') return;
    const id = setInterval(async () => {
      const updated = await api.getJob(videoId).catch(() => null);
      if (!updated) return;
      setJobDetails(updated);
      if (updated.status === 'completed') {
        clearInterval(id);
        loadTranscript();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [jobDetails?.status, videoId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadJobDetails(), loadSavedSummary(), loadSavedQuiz()]);
    setLoading(false);
  }

  async function loadJobDetails() {
    try {
      const data = await api.getJob(videoId);
      setJobDetails(data);
      if (data.status === 'completed') await loadTranscript();
    } catch { /* non-critical */ }
  }

  async function loadTranscript() {
    try { setTranscript(await api.getTranscript(videoId)); }
    catch { /* transcript may not exist yet */ }
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
      setSavedQuizMeta({ createdAt: data.createdAt });
    } catch { /* no saved quiz yet */ }
  }

  async function handleStartTranscription() {
    setStartingTranscription(true); setError('');
    try {
      await api.startTranscription(videoId, whisperModel);
      const updated = await api.getJob(videoId);
      setJobDetails(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start transcription');
    } finally {
      setStartingTranscription(false);
    }
  }

  async function handleGenerateSummary() {
    setSummarizing(true); setError('');
    try {
      const data = await api.generateSummary(videoId, { length: summaryLength });
      setSummary(data.summary);
      setSavedSummaryMeta({ createdAt: new Date().toISOString(), model: data.model });
      setTranslatedSummary('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate summary');
    } finally { setSummarizing(false); }
  }

  async function handleTranslateTranscript() {
    if (!transcriptLang || !transcript?.fullText) return;
    setTranslatingTranscript(true); setTranslatedTranscript('');
    try {
      const data = await api.translateText(transcript.fullText, transcriptLang);
      setTranslatedTranscript(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally { setTranslatingTranscript(false); }
  }

  async function handleTranslateSummary() {
    if (!summaryLang || !summary) return;
    setTranslatingSummary(true); setTranslatedSummary('');
    try {
      const data = await api.translateText(summary, summaryLang);
      setTranslatedSummary(data.translatedText);
    } catch (err) {
      setError('Translation failed: ' + (err.response?.data?.error || err.message));
    } finally { setTranslatingSummary(false); }
  }

  async function handleGenerateMCQ() {
    setGeneratingMCQ(true); setMcqs([]); setError('');
    try {
      const data = await api.generateMCQ(videoId);
      setMcqs(data.mcqs || []);
      setSavedQuizMeta({ createdAt: new Date().toISOString() });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate quiz');
    } finally { setGeneratingMCQ(false); }
  }

  async function handleEvaluate() {
    if (!evalReference.trim()) return;
    setEvaluating(true); setEvalResult(null);
    try {
      const hypothesis = activeEval === 'wer' ? transcript?.fullText : summary;
      const fn = activeEval === 'wer' ? api.evaluateWER : api.evaluateROUGE;
      setEvalResult(await fn(hypothesis, evalReference));
    } catch (err) {
      setError(err.response?.data?.error || 'Evaluation failed');
    } finally { setEvaluating(false); }
  }

  function copyTranscript() {
    navigator.clipboard.writeText(transcript?.fullText || '');
  }

  function exportSRT() {
    const lines = (transcript?.segments || []).map((seg, i) => {
      return `${i + 1}\n${fmtSRT(seg.start)} --> ${fmtSRT(seg.end)}\n${seg.text}\n`;
    }).join('\n');
    download(lines, `transcript-${videoId}.srt`, 'text/srt');
  }

  function exportTXT() {
    download(transcript?.fullText || '', `transcript-${videoId}.txt`, 'text/plain');
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#8888a8]">Loading…</span>
        </div>
      </div>
    );
  }

  const status = jobDetails?.status;
  const isTranscribed = status === 'completed' && transcript;
  const isProcessing  = status === 'queued' || status === 'running';

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-[#2a2a3e] bg-[#13131f] px-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-500 text-[#e8e8f0]'
                : 'border-transparent text-[#555570] hover:text-[#8888a8]'
            }`}
          >
            {tab.label}
            {tab.id === 'mcqs' && mcqs.length > 0 && (
              <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                {mcqs.length}
              </span>
            )}
            {tab.id === 'transcript' && isProcessing && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </button>
        ))}

        {/* Export controls */}
        {isTranscribed && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={copyTranscript} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8888a8] hover:text-[#e8e8f0] hover:bg-[#1a1a2e] rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
            <button onClick={exportSRT} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8888a8] hover:text-[#e8e8f0] hover:bg-[#1a1a2e] rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              .srt
            </button>
            <button onClick={exportTXT} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8888a8] hover:text-[#e8e8f0] hover:bg-[#1a1a2e] rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              .txt
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 mx-5 mt-3 px-4 py-2.5 bg-red-900/30 border border-red-700/40 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── VIDEO TAB ── */}
        {activeTab === 'video' && (
          <div className="p-5">
            {jobDetails?.videoPresignedUrl || jobDetails?.youtubeUrl ? (
              <VideoPlayer
                ref={videoPlayerRef}
                videoUrl={jobDetails.videoPresignedUrl}
                youtubeUrl={jobDetails.youtubeUrl}
                segments={isTranscribed ? transcript.segments : []}
                onTimeUpdate={setCurrentTime}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg className="w-12 h-12 text-[#555570] mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                <p className="text-sm text-[#555570]">No video source available</p>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSCRIPT TAB ── */}
        {activeTab === 'transcript' && (
          <div>
            {/* Not yet transcribed */}
            {(status === 'ready' || status === 'failed') && (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-[#1a1a2e] border border-[#2a2a3e] flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#555570]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[#e8e8f0] font-medium mb-1">
                    {status === 'failed' ? 'Transcription failed — try again' : 'Ready to transcribe'}
                  </p>
                  <p className="text-sm text-[#555570]">Select a Whisper model and click Transcribe to generate the transcript.</p>
                </div>

                {/* Model selector */}
                <div className="w-full max-w-sm space-y-3">
                  <label className="text-xs font-bold text-[#555570] uppercase tracking-wider block text-left">
                    Whisper Model
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {WHISPER_MODELS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setWhisperModel(m.value)}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition ${
                          whisperModel === m.value
                            ? 'border-indigo-500 bg-indigo-600/15 text-[#e8e8f0]'
                            : 'border-[#2a2a3e] bg-[#1a1a2e] text-[#8888a8] hover:border-[#3a3a5e]'
                        }`}
                      >
                        <span className="font-medium">{m.label}</span>
                        <span className="text-xs text-[#555570]">{m.hint}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleStartTranscription}
                    disabled={startingTranscription}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-[#2a2a3e] disabled:text-[#555570] disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 mt-2"
                  >
                    {startingTranscription ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Transcribe
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="flex flex-col items-center justify-center py-20 gap-5">
                <div className="w-12 h-12 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
                <div className="text-center">
                  <p className="text-[#e8e8f0] font-medium mb-1">
                    {status === 'queued' ? 'Queued for transcription…' : 'Transcribing…'}
                  </p>
                  <p className="text-sm text-[#555570]">This may take a few minutes depending on the model and file length.</p>
                </div>
              </div>
            )}

            {/* Completed — show segments */}
            {isTranscribed && (
              <div>
                {/* Metadata strip */}
                <div className="flex items-center gap-4 px-5 py-3 border-b border-[#2a2a3e] text-xs text-[#555570]">
                  <span>Language: <span className="text-[#8888a8]">{transcript.language || '—'}</span></span>
                  <span>Segments: <span className="text-[#8888a8]">{transcript.segments?.length ?? 0}</span></span>
                  <span>Characters: <span className="text-[#8888a8]">{transcript.fullText?.length?.toLocaleString() ?? 0}</span></span>
                </div>

                {/* Segment list */}
                <div className="p-5 space-y-4">
                  {(transcript.segments || []).map((seg, i) => {
                    const isActive = currentTime >= seg.start && currentTime <= seg.end;
                    return (
                      <div key={i} className={`flex gap-3 transition-opacity ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}>
                        <button
                          onClick={() => videoPlayerRef.current?.seekTo(seg.start)}
                          title="Jump to this segment"
                          className={`shrink-0 font-mono text-xs px-2 py-1 rounded-md mt-0.5 transition-colors cursor-pointer hover:bg-indigo-600/30 ${
                            isActive ? 'bg-indigo-600/30 text-indigo-300' : 'bg-[#1a1a2e] text-[#6b7fff]'
                          }`}
                        >
                          {fmt(seg.start)}
                        </button>
                        <p className={`text-sm leading-relaxed flex-1 ${isActive ? 'text-[#e8e8f0]' : 'text-[#8888a8]'}`}>
                          {seg.text}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Translate transcript */}
                <div className="px-5 pb-5 pt-2 border-t border-[#2a2a3e] mt-2">
                  <p className="text-xs font-bold text-[#555570] uppercase tracking-wider mb-3">Translate</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={transcriptLang}
                      onChange={e => setTranscriptLang(e.target.value)}
                      disabled={translatingTranscript}
                      className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-1.5 text-xs text-[#e8e8f0] focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="">— Select language —</option>
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                    <button
                      onClick={handleTranslateTranscript}
                      disabled={!transcriptLang || translatingTranscript}
                      className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-40 rounded-lg text-xs transition"
                    >
                      {translatingTranscript ? 'Translating…' : 'Translate'}
                    </button>
                  </div>
                  {translatedTranscript && (
                    <div className="mt-3 p-4 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl text-sm text-[#c8c8e0] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                      <span className="text-[10px] font-medium text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded mr-2">
                        {LANGUAGES.find(l => l.code === transcriptLang)?.label}
                      </span>
                      {translatedTranscript}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {activeTab === 'summary' && (
          <div className="p-5 space-y-5">
            {!isTranscribed && (
              <div className="p-6 bg-[#1a1a2e] border border-dashed border-[#2a2a3e] rounded-xl text-sm text-[#555570] text-center">
                Transcribe the video first before generating a summary.
              </div>
            )}

            {isTranscribed && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#e8e8f0]">AI Summary</span>
                    {savedSummaryMeta && (
                      <span className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded-full">
                        saved
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={summarizing}
                    className="bg-indigo-600 text-white py-1.5 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-[#2a2a3e] disabled:text-[#555570] disabled:cursor-not-allowed text-xs font-medium transition"
                  >
                    {summarizing ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
                  </button>
                </div>

                {/* Length picker */}
                <div className="flex items-center gap-0.5 bg-[#1a1a2e] rounded-lg p-0.5 w-fit">
                  {SUMMARY_LENGTHS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSummaryLength(opt.value)}
                      disabled={summarizing}
                      title={opt.hint}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                        summaryLength === opt.value ? 'bg-indigo-600 text-white' : 'text-[#555570] hover:text-[#8888a8]'
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {summarizing && (
                  <div className="flex items-center gap-3 p-4 bg-indigo-900/20 border border-indigo-700/30 rounded-xl text-sm text-indigo-400">
                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Generating summary…
                  </div>
                )}

                {summary ? (
                  <div className="p-4 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl text-sm text-[#c8c8e0] leading-relaxed">
                    {summary}
                  </div>
                ) : !summarizing && (
                  <div className="p-8 bg-[#1a1a2e] border border-dashed border-[#2a2a3e] rounded-xl text-sm text-[#555570] text-center">
                    No summary yet — click Generate Summary
                  </div>
                )}

                {summary && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-[#555570] uppercase tracking-wider">Translate</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={summaryLang}
                        onChange={e => setSummaryLang(e.target.value)}
                        disabled={translatingSummary}
                        className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-1.5 text-xs text-[#e8e8f0] focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        <option value="">— Select language —</option>
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                      <button
                        onClick={handleTranslateSummary}
                        disabled={!summaryLang || translatingSummary}
                        className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-40 rounded-lg text-xs transition"
                      >
                        {translatingSummary ? 'Translating…' : 'Translate'}
                      </button>
                    </div>
                    {translatedSummary && (
                      <div className="p-4 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl text-sm text-[#c8c8e0] leading-relaxed">
                        <span className="text-[10px] font-medium text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded mr-2">
                          {LANGUAGES.find(l => l.code === summaryLang)?.label}
                        </span>
                        {translatedSummary}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── MCQS TAB ── */}
        {activeTab === 'mcqs' && (
          <div className="p-5 space-y-5">
            {!isTranscribed && (
              <div className="p-6 bg-[#1a1a2e] border border-dashed border-[#2a2a3e] rounded-xl text-sm text-[#555570] text-center">
                Transcribe the video first before generating a quiz.
              </div>
            )}

            {isTranscribed && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#e8e8f0]">Multiple Choice Quiz</span>
                    {savedQuizMeta && (
                      <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">saved</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerateMCQ}
                      disabled={generatingMCQ}
                      className="bg-amber-600 text-white py-1.5 px-4 rounded-lg hover:bg-amber-700 disabled:bg-[#2a2a3e] disabled:text-[#555570] disabled:cursor-not-allowed text-xs font-medium transition"
                    >
                      {generatingMCQ ? 'Generating…' : mcqs.length > 0 ? 'Regenerate Quiz' : 'Generate Quiz'}
                    </button>
                  </div>
                </div>

                {generatingMCQ && (
                  <div className="flex items-center gap-3 p-4 bg-amber-900/20 border border-amber-700/30 rounded-xl text-sm text-amber-400">
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Generating quiz…
                  </div>
                )}
                {!generatingMCQ && mcqs.length > 0 && <QuizPlayer mcqs={mcqs} videoId={videoId} />}
                {!generatingMCQ && mcqs.length === 0 && (
                  <div className="p-8 bg-[#1a1a2e] border border-dashed border-[#2a2a3e] rounded-xl text-sm text-[#555570] text-center">
                    No quiz yet — click Generate Quiz
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="p-5 space-y-6">
            {/* Evaluation metrics */}
            <section>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-[#555570] uppercase tracking-wider">Evaluation Metrics</p>
                <span className="text-[10px] text-[#555570] bg-[#1a1a2e] px-2 py-0.5 rounded-full">thesis</span>
              </div>
              <p className="text-xs text-[#555570] mb-4">Compare model output against a human-written reference.</p>

              <div className="flex gap-2 mb-4">
                {[
                  { key: 'wer',   label: 'WER — Transcription' },
                  { key: 'rouge', label: 'ROUGE — Summary' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveEval(activeEval === key ? null : key); setEvalResult(null); setEvalReference(''); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                      activeEval === key
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-[#1a1a2e] text-[#8888a8] border-[#2a2a3e] hover:border-indigo-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeEval && (
                <div className="space-y-3">
                  <textarea
                    value={evalReference}
                    onChange={e => setEvalReference(e.target.value)}
                    rows={4}
                    placeholder={activeEval === 'wer' ? 'Paste reference transcript…' : 'Paste reference summary…'}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 text-xs text-[#e8e8f0] placeholder-[#555570] focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={handleEvaluate}
                    disabled={evaluating || !evalReference.trim()}
                    className="bg-[#2a2a3e] text-[#e8e8f0] text-xs px-4 py-2 rounded-lg hover:bg-[#3a3a5e] disabled:opacity-40 transition"
                  >
                    {evaluating ? 'Evaluating…' : 'Run Evaluation'}
                  </button>

                  {evalResult && (
                    <div className="p-4 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl">
                      {activeEval === 'wer' ? (
                        <div>
                          <p className="text-xs font-semibold text-[#8888a8] mb-1">Word Error Rate</p>
                          <p className="text-3xl font-bold text-emerald-400">{evalResult.wer_percent}%</p>
                          <p className="text-xs text-[#555570] mt-1">{evalResult.interpretation}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[#8888a8] mb-3">ROUGE Scores (F1)</p>
                          {['rouge1', 'rouge2', 'rougeL'].map(key => (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-xs font-mono w-16 text-[#555570]">{key}</span>
                              <div className="flex-1 bg-[#2a2a3e] rounded-full h-1.5">
                                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(evalResult[key]?.f1 || 0) * 100}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-[#e8e8f0] w-12 text-right">
                                {((evalResult[key]?.f1 || 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                          <p className="text-xs text-[#555570] mt-1">{evalResult.interpretation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </div>
  );
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function fmtSRT(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)},${String(ms).padStart(3, '0')}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
