import axios from 'axios';
import { API_URL } from '../config/constants';

// Configure axios defaults
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to add Authorization header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth endpoints
export const authAPI = {
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  
  register: (name: string, email: string, password: string) => 
    api.post('/auth/register', { name, email, password }),
  
  getCurrentUser: () => 
    api.get('/auth/me'),
};

// Profile endpoints
export const profileAPI = {
  getProfile: () => 
    api.get('/profile'),
  
  updateProfile: (profileData: any) => 
    api.put('/profile', profileData),
};

// Daily logs endpoints
export const logsAPI = {
  getLogs: (params?: { startDate?: string; endDate?: string }) => 
    api.get('/logs', { params }),
  
  getLogByDate: (date: string) => 
    api.get(`/logs/${date}`),
  
  createLog: (logData: any) => 
    api.post('/logs', logData),
};

// Lifestyle tracking endpoints
export const lifestyleAPI = {
  getLogs: (params?: { type?: string; startDate?: string; endDate?: string }) => 
    api.get('/lifestyle', { params }),
  
  createLog: (logData: any) => 
    api.post('/lifestyle', logData),
};

// Medical files endpoints
export const filesAPI = {
  getFiles: (params?: { category?: string }) => 
    api.get('/files', { params }),
  
  uploadFile: (fileData: FormData) => 
    api.post('/files', fileData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
  
  downloadFile: (fileId: number | string) => 
    api.get(`/files/${fileId}/download`, { responseType: 'blob' }),
  
  deleteFile: (fileId: number | string) => 
    api.delete(`/files/${fileId}`),
};

// Health insights endpoints
export const insightsAPI = {
  getInsights: (params?: { category?: string }) => 
    api.get('/insights', { params }),
};

// Dashboard endpoints
export const dashboardAPI = {
  getStats: () => 
    api.get('/dashboard/stats'),
  
  getMoodChart: (params?: { days?: number }) => 
    api.get('/dashboard/mood-chart', { params }),
  
  getTopSymptoms: () => 
    api.get('/dashboard/top-symptoms'),
};

export default api;