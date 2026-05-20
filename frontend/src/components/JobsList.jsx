import { useState, useEffect } from 'react';
import { api } from '../services/api';

const STATUS = {
  ready:     { label: 'Ready',   cls: 'bg-gray-200 text-gray-500' },
  queued:    { label: 'Queued',  cls: 'bg-indigo-900/40 text-indigo-400' },
  running:   { label: 'Running', cls: 'bg-blue-900/50 text-blue-400' },
  completed: { label: 'Done',    cls: 'bg-emerald-900/40 text-emerald-400' },
  failed:    { label: 'Failed',  cls: 'bg-red-900/40 text-red-400' },
};

export default function JobsList({ refreshTrigger, selectedJobId, onSelectJob }) {
  const [jobs, setJobs]       = useState([]);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { loadJobs(); }, [refreshTrigger]);

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
    if (!hasActive) return;
    const id = setInterval(loadJobs, 3000);
    return () => clearInterval(id);
  }, [jobs]);

  async function loadJobs() {
    try {
      const data = await api.getJobs(1, 50);
      setJobs(data.jobs || []);
    } catch { /* silent */ }
  }

  async function handleDelete(e, jobId) {
    e.stopPropagation();
    setDeleting(jobId);
    try {
      await api.deleteJob(jobId);
      loadJobs();
    } finally {
      setDeleting(null);
    }
  }

  if (jobs.length === 0) {
    return <p className="text-xs text-gray-400 px-1 py-6 text-center">No files yet</p>;
  }

  return (
    <div className="space-y-1">
      {jobs.map(job => {
        const s = STATUS[job.status] || STATUS.queued;
        const isSelected = selectedJobId === job.job_id;
        const isClickable = job.status !== 'failed';

        return (
          <div
            key={job.job_id}
            onClick={() => isClickable && onSelectJob?.(job.job_id)}
            className={`flex items-center gap-2 px-2 py-2.5 rounded-lg group transition-colors border ${
              isSelected
                ? 'bg-indigo-600/20 border-indigo-600/40'
                : isClickable
                  ? 'hover:bg-gray-100 cursor-pointer border-transparent'
                  : 'border-transparent opacity-50'
            }`}
          >
            {/* Status dot */}
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              job.status === 'running'   ? 'bg-blue-400 animate-pulse' :
              job.status === 'completed' ? 'bg-emerald-500' :
              job.status === 'failed'    ? 'bg-red-500' : 'bg-[#555570]'
            }`} />

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{job.filename || 'Unnamed'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(job.created_at).toLocaleDateString()}</p>
            </div>

            {/* Status badge */}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 ${s.cls}`}>
              {s.label}
            </span>

            {/* Delete button */}
            <button
              onClick={e => handleDelete(e, job.job_id)}
              disabled={deleting === job.job_id}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-400 hover:text-red-400 transition flex-shrink-0 disabled:opacity-40"
            >
              {deleting === job.job_id ? (
                <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
