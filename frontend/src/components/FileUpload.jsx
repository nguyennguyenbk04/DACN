import { useState, useCallback } from 'react';
import { api } from '../services/api';

const TABS = [
  { id: 'file',    label: 'Upload File' },
  { id: 'youtube', label: 'YouTube URL' },
];

export default function FileUpload({ onUploadComplete }) {
  const [tab, setTab]           = useState('file');
  const [file, setFile]         = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const reset = () => { setError(''); setSuccess(''); };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); reset(); }
  }, []);

  const handleChange = (e) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); reset(); }
  };

  const handleFileUpload = async () => {
    if (!file) { setError('Please select a file first'); return; }
    setUploading(true); reset(); setProgress(0);
    try {
      const result = await api.uploadFile(file, (ev) => {
        setProgress(Math.round((ev.loaded * 100) / ev.total));
      });
      setSuccess(`Uploaded! Transcription queued.`);
      onUploadComplete?.(result);
      setFile(null); setProgress(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleYoutubeUpload = async () => {
    if (!youtubeUrl.trim()) { setError('Please enter a YouTube URL'); return; }
    const ytRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/;
    if (!ytRegex.test(youtubeUrl)) { setError('Please enter a valid YouTube URL'); return; }
    setUploading(true); reset();
    try {
      const result = await api.uploadYoutube(youtubeUrl);
      setSuccess('YouTube video queued for transcription!');
      onUploadComplete?.(result);
      setYoutubeUrl('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to queue YouTube video.');
    } finally {
      setUploading(false);
    }
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <svg className="w-[18px] h-[18px] text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          New Transcription
        </div>
        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); reset(); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                tab === t.id ? 'bg-white text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === 'file' ? (
          <>
            {/* ── Drop zone ── */}
            <div
              className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${
                dragActive ? 'border-emerald-400 bg-emerald-50/50 scale-[1.01]' : 'border-gray-200 hover:border-gray-300 bg-white'
              } ${file ? 'py-5 px-5' : 'py-14 px-5'}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            >
              <input type="file" id="file-upload" className="hidden" onChange={handleChange} accept="audio/*,video/*" disabled={uploading} />
              {!file ? (
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                    <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 4.502 4.502 0 013.516 5.855A4.5 4.5 0 0117.25 19.5H6.75z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-700 font-medium">Drop your file here, or <span className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">browse</span></p>
                    <p className="text-xs text-gray-400 mt-1">MP3, WAV, MP4, WEBM, etc. — up to 500 MB</p>
                  </div>
                </label>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fileSizeMB} MB</p>
                  </div>
                  {!uploading && (
                    <button onClick={() => { setFile(null); reset(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Progress */}
            {uploading && (
              <div className="mt-4">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600">Uploading…</span>
                  <span className="text-xs font-semibold text-emerald-600">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── YouTube tab ── */
          <div className="py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Paste a YouTube URL</p>
                <p className="text-xs text-gray-400">The video audio will be downloaded and transcribed automatically</p>
              </div>
            </div>
            <input
              type="url"
              value={youtubeUrl}
              onChange={e => { setYoutubeUrl(e.target.value); reset(); }}
              onKeyDown={e => e.key === 'Enter' && handleYoutubeUpload()}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={uploading}
              className="w-full text-sm border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 placeholder-gray-300"
            />
            {uploading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                Queuing video for transcription…
              </div>
            )}
          </div>
        )}

        {/* ── Feedback ── */}
        {error && (
          <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {tab === 'file' ? (file ? `${fileSizeMB} MB selected` : 'No file selected') : 'Enter a YouTube URL above'}
        </span>
        <button
          onClick={tab === 'file' ? handleFileUpload : handleYoutubeUpload}
          disabled={uploading || (tab === 'file' ? !file : !youtubeUrl.trim())}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium py-2 px-5 rounded-lg hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {uploading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>Transcribe</>
          )}
        </button>
      </div>
    </div>
  );
}
