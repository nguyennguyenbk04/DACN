import { useState, useEffect } from 'react';
import { api } from '../services/api';

const STATUS_STYLES = {
  queued:    'bg-gray-100 text-gray-600',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
};

export default function JobsList({ refreshTrigger, onSelectJob }) {
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleting, setDeleting]   = useState(null);

  useEffect(() => { loadJobs(); }, [page, refreshTrigger]);

  // Auto-poll every 4 s while any job is running or queued
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
    if (!hasActive) return;
    const id = setInterval(loadJobs, 4000);
    return () => clearInterval(id);
  }, [jobs]);

  async function loadJobs() {
    setLoading(true);
    try {
      const data = await api.getJobs(page, 10);
      setJobs(data.jobs || []);
      setTotalPages(data.totalPages || 1);
      setError('');
    } catch {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e, jobId) {
    e.stopPropagation();
    setDeleting(jobId);
    try {
      await api.deleteJob(jobId);
      loadJobs();
    } catch (err) {
      setError('Delete failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeleting(null);
    }
  }

  function handleSelect(job) {
    if (job.status === 'completed') onSelectJob?.(job.job_id);
  }

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 rounded-t-2xl">
        <h2 className="text-sm font-semibold text-gray-700">Transcription History</h2>
        <button onClick={loadJobs} className="text-xs text-gray-400 hover:text-gray-600 transition">Refresh</button>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No transcription jobs yet</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {jobs.map(job => (
            <div
              key={job.job_id}
              onClick={() => handleSelect(job)}
              className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                job.status === 'completed' ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
              }`}
            >
              {/* Status dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                job.status === 'completed' ? 'bg-emerald-500' :
                job.status === 'running'   ? 'bg-blue-500 animate-pulse' :
                job.status === 'failed'    ? 'bg-red-500' : 'bg-gray-400'
              }`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{job.filename || 'Unnamed file'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(job.created_at).toLocaleString()}</p>
                {job.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">Error: {job.error_message}</p>
                )}
              </div>

              {/* Badge */}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[job.status] || STATUS_STYLES.queued}`}>
                {job.status}
              </span>

              {/* Delete */}
              <button
                onClick={e => handleDelete(e, job.job_id)}
                disabled={deleting === job.job_id}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition flex-shrink-0 disabled:opacity-40"
                title="Delete job"
              >
                {deleting === job.job_id ? (
                  <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
