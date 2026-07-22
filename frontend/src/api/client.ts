import axios from 'axios';
import type { EvaluationResponse } from '../types/evaluation';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
});

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

export const exportApi = {
  exportDocx: async (formData: FormData): Promise<Blob> => {
    const res = await fetch(`${BASE_URL}/api/export/docx`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.blob();
  },
};

export const feedbackApi = {
  submit: async (payload: {
    overall_satisfaction: number;
    likelihood_to_use_again: number;
    ease_of_use: number;
    confusion: string;
    wished_features: string;
  }): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
  },
};

export const symbolsApi = {
  list: () => apiClient.get('/api/symbols'),
  getImageUrl: (symbolId: string) => `${BASE_URL}/api/symbols/${symbolId}/image`,
};
