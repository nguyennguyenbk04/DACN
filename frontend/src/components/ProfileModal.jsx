import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const TABS = ['Profile', 'Stats', 'Performance'];

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[10px] font-bold text-[#555570] uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-[#e8e8f0]">{value ?? '—'}</p>
      {sub && <p className="text-xs text-[#555570]">{sub}</p>}
    </div>
  );
}

function ActivityGrid({ uploadActivity, quizActivity }) {
  const days = 30;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const uploadMap = {};
  const quizMap = {};
  (uploadActivity || []).forEach(r => { uploadMap[r.date?.slice(0, 10)] = Number(r.count); });
  (quizActivity  || []).forEach(r => { quizMap[r.date?.slice(0, 10)]   = Number(r.count); });

  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, uploads: uploadMap[key] || 0, quizzes: quizMap[key] || 0 };
  });

  return (
    <div>
      <p className="text-[10px] font-bold text-[#555570] uppercase tracking-widest mb-2">Activity — last 30 days</p>
      <div className="flex gap-1 flex-wrap">
        {cells.map(c => {
          const total = c.uploads + c.quizzes;
          const bg = total === 0 ? 'bg-[#1a1a2e]'
            : total <= 1 ? 'bg-indigo-900'
            : total <= 3 ? 'bg-indigo-700'
            : 'bg-indigo-500';
          return (
            <div
              key={c.key}
              title={`${c.key}\n${c.uploads} upload(s), ${c.quizzes} quiz(zes)`}
              className={`w-5 h-5 rounded-sm ${bg} cursor-default`}
            />
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        <span className="text-[10px] text-[#555570]">Less</span>
        {['bg-[#1a1a2e]', 'bg-indigo-900', 'bg-indigo-700', 'bg-indigo-500'].map(c => (
          <span key={c} className={`w-3 h-3 rounded-sm ${c} inline-block`} />
        ))}
        <span className="text-[10px] text-[#555570]">More</span>
      </div>
    </div>
  );
}

export default function ProfileModal({ onClose }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('Profile');

  // Profile tab
  const [name, setName]               = useState(user?.name || '');
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [profileMsg, setProfileMsg]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]       = useState(false);

  // Stats tab
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Performance tab
  const [perf, setPerf]               = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (tab === 'Stats' && !stats) {
      setStatsLoading(true);
      api.getStats().then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
    }
    if (tab === 'Performance' && !perf) {
      setPerfLoading(true);
      api.getPerformance().then(d => setPerf(d.videos)).catch(() => {}).finally(() => setPerfLoading(false));
    }
  }, [tab]);

  async function handleSaveProfile() {
    setSaving(true); setProfileMsg(null);
    try {
      const payload = {};
      if (name !== (user?.name || '')) payload.name = name;
      if (newPw) { payload.currentPassword = currentPw; payload.newPassword = newPw; }
      if (!Object.keys(payload).length) { setProfileMsg({ ok: true, text: 'Nothing changed.' }); return; }
      await api.updateProfile(payload);
      setCurrentPw(''); setNewPw('');
      setProfileMsg({ ok: true, text: 'Saved successfully.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err.response?.data?.error || 'Failed to save.' });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteAccount();
      logout();
      onClose();
    } catch (err) {
      setProfileMsg({ ok: false, text: err.response?.data?.error || 'Failed to delete account.' });
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const scoreColor = s => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400';
  const scoreBg   = s => s >= 80 ? 'bg-emerald-900/30' : s >= 60 ? 'bg-yellow-900/30' : 'bg-red-900/30';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#13131f] border border-[#2a2a3e] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a3e] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#e8e8f0]">{user?.name || 'User'}</p>
              <p className="text-xs text-[#555570]">{user?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2a2a3e] text-[#555570] hover:text-[#e8e8f0] transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a3e] flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
                tab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[#555570] hover:text-[#8888a8]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── PROFILE TAB ── */}
          {tab === 'Profile' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#8888a8] mb-1.5">Display name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="border-t border-[#2a2a3e] pt-4">
                <p className="text-xs font-semibold text-[#8888a8] mb-3">Change password</p>
                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] placeholder-[#555570] focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] placeholder-[#555570] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {profileMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${profileMsg.ok ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                  {profileMsg.text}
                </p>
              )}

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>

              {/* Delete account */}
              <div className="border-t border-[#2a2a3e] pt-4">
                <p className="text-xs font-semibold text-[#8888a8] mb-1">Danger zone</p>
                <p className="text-xs text-[#555570] mb-3">Permanently delete your account and all associated data.</p>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full border border-red-900 text-red-400 hover:bg-red-900/20 text-sm font-semibold py-2 rounded-xl transition"
                  >
                    Delete account
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400 font-semibold">Are you sure? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 border border-[#2a2a3e] text-[#8888a8] hover:bg-[#1a1a2e] text-sm py-2 rounded-xl transition">
                        Cancel
                      </button>
                      <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition">
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STATS TAB ── */}
          {tab === 'Stats' && (
            statsLoading ? (
              <div className="flex items-center justify-center h-40 text-[#555570] text-sm">Loading…</div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Videos processed" value={stats.totalVideos} />
                  <StatCard label="Quizzes taken" value={stats.totalQuizzes} />
                  <StatCard label="Average score" value={stats.avgScore != null ? `${stats.avgScore}%` : '—'} />
                  <StatCard label="Current streak" value={stats.streak} sub={stats.streak === 1 ? 'day' : 'days'} />
                </div>
                <ActivityGrid uploadActivity={stats.uploadActivity} quizActivity={stats.quizActivity} />
              </>
            ) : (
              <p className="text-sm text-[#555570] text-center py-10">No data yet.</p>
            )
          )}

          {/* ── PERFORMANCE TAB ── */}
          {tab === 'Performance' && (
            perfLoading ? (
              <div className="flex items-center justify-center h-40 text-[#555570] text-sm">Loading…</div>
            ) : perf && perf.length > 0 ? (
              <>
                {perf.filter(v => Number(v.avgScore) < 60).length > 0 && (
                  <div className="bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-red-400 mb-1">Weak topics — score below 60%</p>
                    <ul className="space-y-0.5">
                      {perf.filter(v => Number(v.avgScore) < 60).map(v => (
                        <li key={v.jobId} className="text-xs text-red-300 truncate">• {v.filename}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  {perf.map(v => {
                    const score = Number(v.avgScore);
                    const pct = Math.min(score, 100);
                    return (
                      <div key={v.jobId} className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-medium text-[#e8e8f0] truncate flex-1 mr-2">{v.filename}</p>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(score)} ${scoreColor(score)}`}>
                            {score}%
                          </span>
                        </div>
                        <div className="w-full bg-[#0d0d14] rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-[#555570] mt-1">{v.attempts} attempt{v.attempts !== 1 ? 's' : ''} · best {v.bestScore}%</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#555570] text-center py-10">Take some quizzes to see your performance here.</p>
            )
          )}

        </div>
      </div>
    </div>
  );
}
