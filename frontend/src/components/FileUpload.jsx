import { useState, useCallback } from 'react';
import { api } from '../services/api';

export default function FileUpload({ onUploadComplete }) {
  const [tab, setTab]               = useState('file');
  const [file, setFile]             = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  const reset = () => { setError(''); setSuccess(''); };

  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); reset(); }
  }, []);

  const handleFileUpload = async () => {
    if (!file) return;
    setUploading(true); reset(); setProgress(0);
    try {
      const result = await api.uploadFile(file, (ev) => {
        setProgress(Math.round((ev.loaded * 100) / ev.total));
      });
      setSuccess('Uploaded!');
      onUploadComplete?.(result);
      setFile(null); setProgress(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleYoutubeUpload = async () => {
    if (!youtubeUrl.trim()) return;
    const ytRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/;
    if (!ytRegex.test(youtubeUrl)) { setError('Invalid YouTube URL'); return; }
    setUploading(true); reset();
    try {
      const result = await api.uploadYoutube(youtubeUrl);
      setSuccess('Added!');
      onUploadComplete?.(result);
      setYoutubeUrl('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex bg-gray-50 rounded-lg p-0.5">
        {[{ id: 'file', label: 'File' }, { id: 'youtube', label: 'YouTube' }].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); reset(); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
              tab === t.id ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* File drop zone */}
      {tab === 'file' ? (
        <div
          className={`relative rounded-xl border-2 border-dashed transition-colors ${
            dragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-gray-200 hover:border-[#3a3a5e]'
          } ${file ? 'p-3' : 'py-7 px-3'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        >
          <input
            type="file" id="file-upload" className="hidden"
            onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); reset(); } }}
            accept="audio/*,video/*" disabled={uploading}
          />
          {!file ? (
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 4.502 4.502 0 013.516 5.855A4.5 4.5 0 0117.25 19.5H6.75z" />
              </svg>
              <div className="text-center">
                <p className="text-xs text-gray-500">Drop video or audio</p>
                <p className="text-[10px] text-gray-400 mt-0.5">MP4, MP3, WAV, WEBM…</p>
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-[10px] text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              {!uploading && (
                <button onClick={() => setFile(null)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-900 transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <input
          type="url"
          value={youtubeUrl}
          onChange={e => { setYoutubeUrl(e.target.value); reset(); }}
          onKeyDown={e => e.key === 'Enter' && handleYoutubeUpload()}
          placeholder="https://youtube.com/watch?v=..."
          disabled={uploading}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-[#555570] focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
      )}

      {/* Upload progress */}
      {uploading && tab === 'file' && (
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div className="bg-indigo-500 h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error   && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}

      <button
        onClick={tab === 'file' ? handleFileUpload : handleYoutubeUpload}
        disabled={uploading || (tab === 'file' ? !file : !youtubeUrl.trim())}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-xs font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5"
      >
        {uploading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Uploading…
          </>
        ) : 'Upload'}
      </button>
    </div>
  );
}
