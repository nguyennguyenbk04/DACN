import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

// Create an axios instance that auto-attaches the JWT token
const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
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
  // Upload video/audio file
  uploadFile: async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('video', file);
    
    const response = await apiClient.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return response.data;
  },

  // Get all jobs with pagination
  getJobs: async (page = 1, limit = 10) => {
    const response = await apiClient.get('/jobs', {
      params: { page, limit },
    });
    return response.data;
  },

  // Get job details
  getJob: async (jobId) => {
    const response = await apiClient.get(`/jobs/${jobId}`);
    return response.data;
  },

  // Delete a job
  deleteJob: async (jobId) => {
    const response = await apiClient.delete(`/jobs/${jobId}`);
    return response.data;
  },

  // Get transcript
  getTranscript: async (videoId) => {
    const response = await apiClient.get(`/transcripts/${videoId}`);
    return response.data;
  },

  // Generate summary
  generateSummary: async (videoId, options = {}) => {
    const response = await apiClient.post(`/transcripts/${videoId}/summarize`, options);
    return response.data;
  },

  // Generate MCQs
  generateMCQ: async (videoId, numQuestions = 5) => {
    const response = await apiClient.post(`/transcripts/${videoId}/mcq`, { numQuestions });
    return response.data;
  },

  // Translate text
  translateText: async (text, targetLang) => {
    const response = await apiClient.post('/translate', { text, targetLang });
    return response.data;
  },

  // List uploaded videos from MinIO
  getVideos: async () => {
    const response = await apiClient.get('/videos');
    return response.data;
  },
};
