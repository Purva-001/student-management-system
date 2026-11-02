/**
 * apiClient.js — Axios instance for communicating with the existing backend REST API
 *
 * All MCP tools funnel their requests through this client.
 * The MongoDB URI never appears here — the backend handles all database access.
 *
 * Configuration via environment variables:
 *   BACKEND_API_URL  — base URL of the deployed backend (e.g. https://your-app.onrender.com)
 */

'use strict';

const axios = require('axios');

const BACKEND_API_URL = process.env.BACKEND_API_URL;

if (!BACKEND_API_URL) {
  console.error('[apiClient] BACKEND_API_URL is not set. All API calls will fail.');
}

const apiClient = axios.create({
  baseURL: BACKEND_API_URL,
  timeout: 15000, // 15 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor — log outgoing calls (no sensitive data)
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[apiClient] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('[apiClient] Request error:', error.message);
    return Promise.reject(error);
  }
);

// Response interceptor — normalize errors so tools always get a clean message
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // The backend responded with a non-2xx status
      const { status, data } = error.response;
      const message = data?.message || `Backend returned ${status}`;
      const normalizedError = new Error(message);
      normalizedError.statusCode = status;
      normalizedError.backendData = data;
      return Promise.reject(normalizedError);
    } else if (error.request) {
      // Request was made but no response received (timeout, network, etc.)
      const normalizedError = new Error('Backend service is unavailable. Please try again later.');
      normalizedError.statusCode = 503;
      return Promise.reject(normalizedError);
    }
    return Promise.reject(error);
  }
);

module.exports = apiClient;
