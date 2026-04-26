import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import FileUpload from './components/FileUpload';
import JobsList from './components/JobsList';
import VideosList from './components/VideosList';
import TranscriptViewer from './components/TranscriptViewer';

function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [activeTab, setActiveTab] = useState('transcribe');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();

  const handleUploadComplete = (result) => {
    setRefreshTrigger(prev => prev + 1);
    setActiveTab('history');
  };

  const handleSelectJob = (jobId) => {
    setSelectedVideoId(jobId);
  };

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col">
      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between h-14 px-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">
              Quizum
            </span>
          </div>

          {/* Nav Links */}
          <div className="hidden sm:flex items-center gap-1">
            {[
              { id: 'transcribe', label: 'Transcribe', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
              { id: 'videos', label: 'Videos', icon: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z' },
              { id: 'history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 relative">
            <span className="text-xs text-gray-400 hidden lg:block">{user?.email}</span>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center hover:bg-emerald-200 transition"
            >
              <span className="text-sm font-semibold text-emerald-700">
                {user?.name ? user.name[0].toUpperCase() : user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-10 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={() => { logout(); setShowUserMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Mobile Tabs ── */}
      <div className="sm:hidden bg-white border-b border-gray-200 flex">
        {[
          { id: 'transcribe', label: 'Transcribe' },
          { id: 'videos', label: 'Videos' },
          { id: 'history', label: 'History' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-5 py-6">
        {activeTab === 'transcribe' && (
          <div className="space-y-6">
            <FileUpload onUploadComplete={handleUploadComplete} />
          </div>
        )}

        {activeTab === 'videos' && (
          <VideosList onSelectJob={handleSelectJob} />
        )}

        {activeTab === 'history' && (
          <JobsList
            refreshTrigger={refreshTrigger}
            onSelectJob={handleSelectJob}
          />
        )}
      </main>

      {/* ── Transcript Viewer Modal ── */}
      {selectedVideoId && (
        <TranscriptViewer
          videoId={selectedVideoId}
          onClose={() => setSelectedVideoId(null)}
        />
      )}
    </div>
  );
}

export default App;
