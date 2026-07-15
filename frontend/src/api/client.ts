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

export const symbolsApi = {
  list: () => apiClient.get('/api/symbols'),
  getImageUrl: (symbolId: string) => `${BASE_URL}/api/symbols/${symbolId}/image`,
};
