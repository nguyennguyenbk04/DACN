import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function JobsList({ refreshTrigger, onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadJobs();
  }, [page, refreshTrigger]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await api.getJobs(page, 10);
      setJobs(data.jobs || []);
      setTotalPages(data.totalPages || 1);
      setError('');
    } catch (err) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const handleSelectJob = (job) => {
    if (job.status === 'completed') {
      onSelectJob && onSelectJob(job.job_id);
    } else if (job.status !== 'completed') {
      alert(`Job is ${job.status}. Please wait for completion.`);
    }
  };

  const handleDeleteJob = async (e, jobId) => {
    e.stopPropagation(); // Prevent triggering the job selection
    
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      await api.deleteJob(jobId);
      loadJobs(); // Reload the jobs list
    } catch (err) {
      alert('Failed to delete job: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading && jobs.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading jobs...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Transcription Jobs</h2>
      
      {jobs.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No jobs found</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              onClick={() => handleSelectJob(job)}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{job.filename}</p>
                  <p className="text-sm text-gray-500 mt-1">Job ID: {job.job_id}</p>
                  {job.video_id && (
                    <p className="text-sm text-gray-500">Video ID: {job.video_id}</p>
                  )}
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {getStatusBadge(job.status)}
                  <button
                    onClick={(e) => handleDeleteJob(e, job.job_id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete job"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-gray-500">
                Created: {new Date(job.created_at).toLocaleString()}
              </div>
              
              {job.error_message && (
                <div className="mt-2 text-sm text-red-600">
                  Error: {job.error_message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-700">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
