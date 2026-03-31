import axios from 'axios';
import { API_BASE_URL, PDF_BASE, SESSIONS } from './api';

const TOKEN_KEY = 'chatbot_google_token';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// ── Auth interceptor — inject Bearer token on every request ────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ── Model manager (localStorage) ──────────────────────────────────────────
const PRIMARY_MODEL = 'stepfun/step-3.5-flash:free';
const BACKUP_MODEL  = 'meta-llama/llama-3.3-70b-instruct:free';
const LS_MODEL_KEY  = 'ai_active_model';
const LS_SINCE_KEY  = 'ai_model_switch_since';
const BACKUP_MS     = 5 * 60 * 1000; // 5 minutes

function getActiveModel() {
  const model = localStorage.getItem(LS_MODEL_KEY);
  const since = Number(localStorage.getItem(LS_SINCE_KEY) || 0);
  if (model === BACKUP_MODEL && Date.now() - since > BACKUP_MS) {
    // 5 min passed — revert to primary
    localStorage.setItem(LS_MODEL_KEY, PRIMARY_MODEL);
    localStorage.removeItem(LS_SINCE_KEY);
    return PRIMARY_MODEL;
  }
  return model || PRIMARY_MODEL;
}

function switchToBackup() {
  localStorage.setItem(LS_MODEL_KEY, BACKUP_MODEL);
  localStorage.setItem(LS_SINCE_KEY, String(Date.now()));
}

/** 
 * Chat with resume - streaming via SSE.
 * Automatically retries with backup model on 429, stores preference in localStorage.
 */
export const chatWithDocument = async (question, sessionId, onChunk, signal) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  const activeModel = getActiveModel();
  const modelsToTry = activeModel === PRIMARY_MODEL
    ? [PRIMARY_MODEL, BACKUP_MODEL]
    : [BACKUP_MODEL, PRIMARY_MODEL];

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const model = modelsToTry[attempt];

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${PDF_BASE}chat/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question,
          session_id: sessionId,
          preferred_model: model,
        }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') return { answer: '', aborted: true };
      throw e;
    }

    if (response.status === 429) {
      // Rate limited — switch model and retry once
      switchToBackup();
      continue;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'info') {
                console.log(`%c[AI Usage] Model: ${data.model} | Prompt Chars: ${data.prompt_chars} | Approx Tokens: ${data.approx_tokens} | Context Limit: ${data.max_context}`, "color: #00ff00; font-weight: bold;");
              } else if (data.content) {
                fullText += data.content;
                onChunk?.(data.content);
              } else if (data.error) {
                // 429 embedded in SSE stream
                if (data.error.includes('429') || data.error.toLowerCase().includes('rate limit')) {
                  switchToBackup();
                  throw Object.assign(new Error('429'), { name: 'RateLimitError' });
                }
                throw new Error(data.error);
              }
            } catch (e) {
              if (e.name === 'RateLimitError') throw e;
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
      return { answer: fullText }; // success
    } catch (e) {
      if (e.name === 'AbortError') return { answer: fullText, aborted: true };
      if (e.name === 'RateLimitError' && attempt === 0) continue; // retry with other model
      throw e;
    } finally {
      reader.cancel();
    }
  }

  throw new Error('Rate limit hit on all models. Please wait a moment and try again.');
};



export const uploadDocument = async (file, sessionId) => {
  const formData = new FormData();
  // Backend accepts 'files' as a list — we send one at a time for reliability
  formData.append('files', file);
  const response = await api.post(`${PDF_BASE}upload/`, formData, {
    params: { session_id: sessionId },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// ── Sessions ──────────────────────────────────────────────────────

export const getSessions = async () => {
  const response = await api.get(SESSIONS);
  return response.data;
};

export const createSession = async (title) => {
  const response = await api.post(SESSIONS, { title });
  return response.data;
};

export const getSessionMessages = async (sessionId) => {
  const response = await api.get(`${SESSIONS}${sessionId}/messages/`);
  return response.data;
};

export const deleteSession = async (sessionId) => {
  const response = await api.delete(`${SESSIONS}${sessionId}/`);
  return response.data;
};

export const renameSession = async (sessionId, title) => {
  const response = await api.patch(`${SESSIONS}${sessionId}/`, { title });
  return response.data;
};
