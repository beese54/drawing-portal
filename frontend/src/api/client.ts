import axios from 'axios';
import type { EvaluationResponse } from '../types/evaluation';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
});

export const chatApi = {
  createSession: (schematicJson?: object) =>
    apiClient.post('/api/chat/session', { schematic_json: schematicJson ?? null }),
  sendMessage: (sessionId: string, message: string, provider: 'openai' | 'qwen') =>
    apiClient.post('/api/chat/message', { session_id: sessionId, message, provider }),
  getSession: (sessionId: string) =>
    apiClient.get(`/api/chat/session/${sessionId}`),
  deleteSession: (sessionId: string) =>
    apiClient.delete(`/api/chat/session/${sessionId}`),
};

export const knowledgeApi = {
  ingest: () => apiClient.post('/api/knowledge/ingest'),
  status: () => apiClient.get('/api/knowledge/status'),
  files: () => apiClient.get('/api/knowledge/files'),
  metrics: () => apiClient.get('/api/knowledge/metrics'),
  ask: (question: string, provider: string, sessionId?: string | null) =>
    apiClient.post('/api/knowledge/ask', { question, provider, session_id: sessionId ?? null }),
};

export const evaluationApi = {
  evaluate: async (
    formData: FormData,
  ): Promise<EvaluationResponse> => {
    const res = await fetch(`${BASE_URL}/api/evaluate`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<EvaluationResponse>;
  },
};

export const symbolsApi = {
  list: () => apiClient.get('/api/symbols'),
  getImageUrl: (symbolId: string) => `${BASE_URL}/api/symbols/${symbolId}/image`,
  upload: (file: File, name: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    return apiClient.post('/api/symbols', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  rename: (symbolId: string, name: string) =>
    apiClient.patch(`/api/symbols/${symbolId}`, { name }),
  delete: (symbolId: string) =>
    apiClient.delete(`/api/symbols/${symbolId}`),
};
