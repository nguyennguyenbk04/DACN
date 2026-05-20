import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const api = {
  // ── Upload ────────────────────────────────────────────────────────────────
  uploadYoutube: (youtubeUrl) =>
    apiClient.post('/upload-youtube', { youtubeUrl }).then(r => r.data),

  uploadFile: (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('video', file);
    return apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }).then(r => r.data);
  },

  startTranscription: (jobId, whisperModel = 'base') =>
    apiClient.post(`/jobs/${jobId}/transcribe`, { whisperModel }).then(r => r.data),

  // ── Jobs ──────────────────────────────────────────────────────────────────
  getJobs:   (page = 1, limit = 10) => apiClient.get('/jobs', { params: { page, limit } }).then(r => r.data),
  getJob:    (jobId)  => apiClient.get(`/jobs/${jobId}`).then(r => r.data),
  deleteJob: (jobId)  => apiClient.delete(`/jobs/${jobId}`).then(r => r.data),

  // ── Transcripts ───────────────────────────────────────────────────────────
  getTranscript: (videoId) => apiClient.get(`/transcripts/${videoId}`).then(r => r.data),

  // ── Summary ───────────────────────────────────────────────────────────────
  generateSummary: (videoId, options = {}) =>
    apiClient.post(`/transcripts/${videoId}/summarize`, options).then(r => r.data),

  getSavedSummary: (videoId) =>
    apiClient.get(`/transcripts/${videoId}/summary`).then(r => r.data),

  // ── Quiz ──────────────────────────────────────────────────────────────────
  generateMCQ: (videoId) =>
    apiClient.post(`/transcripts/${videoId}/mcq`, {}).then(r => r.data),
  getSavedQuiz: (videoId) =>
    apiClient.get(`/transcripts/${videoId}/quiz`).then(r => r.data),
  submitQuizAttempt: (videoId, answers) =>
    apiClient.post(`/transcripts/${videoId}/quiz/attempt`, { answers }).then(r => r.data),
  getQuizAttempts: (videoId) =>
    apiClient.get(`/transcripts/${videoId}/quiz/attempts`).then(r => r.data),

  // ── Evaluation ────────────────────────────────────────────────────────────
  evaluateWER:   (hypothesis, reference) =>
    apiClient.post('/evaluate/wer',   { hypothesis, reference }).then(r => r.data),
  evaluateROUGE: (hypothesis, reference) =>
    apiClient.post('/evaluate/rouge', { hypothesis, reference }).then(r => r.data),

  // ── Translation ───────────────────────────────────────────────────────────
  translateText: (text, targetLang) =>
    apiClient.post('/translate', { text, targetLang }).then(r => r.data),

  // ── Videos ────────────────────────────────────────────────────────────────
  getVideos: () => apiClient.get('/videos').then(r => r.data),

  // ── Profile ───────────────────────────────────────────────────────────────
  updateProfile: (data) => apiClient.put('/auth/profile', data).then(r => r.data),
  deleteAccount: () => apiClient.delete('/auth/profile').then(r => r.data),
  getStats: () => apiClient.get('/auth/stats').then(r => r.data),
  getPerformance: () => apiClient.get('/auth/performance').then(r => r.data),
};
