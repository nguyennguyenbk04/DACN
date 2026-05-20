import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import FileUpload from './components/FileUpload';
import JobsList from './components/JobsList';
import TranscriptViewer from './components/TranscriptViewer';
import ProfileModal from './components/ProfileModal';

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 h-14 bg-white border-b border-gray-200 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">Quizum</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-11 bg-gray-100 border border-gray-200 rounded-xl shadow-2xl py-1 min-w-[200px] z-50">
              <div className="px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-semibold">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
              </div>
              <button
                onClick={() => { setShowProfile(true); setShowUserMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-900 hover:bg-gray-200 transition"
              >
                Profile & Stats
              </button>
              <button
                onClick={() => { logout(); setShowUserMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-200 transition"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Upload</p>
            <FileUpload onUploadComplete={() => setRefreshTrigger(p => p + 1)} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Files</p>
            <JobsList
              refreshTrigger={refreshTrigger}
              selectedJobId={selectedVideoId}
              onSelectJob={setSelectedVideoId}
            />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-gray-50">
          {selectedVideoId ? (
            <TranscriptViewer
              videoId={selectedVideoId}
              onClose={() => setSelectedVideoId(null)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-12">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center">
                <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-900 font-medium mb-1">No file selected</p>
                <p className="text-sm text-gray-400">Upload a video or audio file, then select it from the sidebar to view its transcript, summary, and quiz.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
