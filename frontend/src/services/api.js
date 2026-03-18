import axios from 'axios';

// ── Base URL ──────────────────────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const API_BASE = API_BASE_URL; // For backward compatibility

// ── Axios client ──────────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// ── Specific Base Paths ──────────────────────────────────────────
export const PDF_BASE = '/pdf/';
export const SESSIONS = '/sessions/';

// ── Endpoint paths ────────────────────────────────────────────────
export const ENDPOINTS = {
  // Existing chat
  CHAT: '/chat/',

  // PDF Analysis
  PDF_UPLOAD: `${PDF_BASE}upload/`,
  PDF_CHAT: `${PDF_BASE}chat/`,

  // Session management
  SESSIONS: SESSIONS,
};
