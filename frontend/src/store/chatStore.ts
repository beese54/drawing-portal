import { create } from 'zustand';
import type { EvaluationResponse } from '../types/evaluation';

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'question' | 'answer' | 'error' | 'info';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type: MessageType;
  metrics?: ChatMetrics | null;
  evaluationResult?: EvaluationResponse;
  timestamp: number;
}

export interface ChatMetrics {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  tokens_per_sec: number;
  retrieved_chunks: number;
  top_similarity: number;
  mean_similarity: number;
  faithfulness: number;
  clarification_turns: number;
  recap_used: boolean;
  rules_summary?: {
    fail: number;
    warn: number;
    pass: number;
    items: Array<{ rule_id: string; description: string; status: string; detail: string }>;
  };
}

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  provider: 'openai' | 'qwen';
  lastMetrics: ChatMetrics | null;

  setSessionId: (id: string | null) => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setLoading: (v: boolean) => void;
  setProvider: (p: 'openai' | 'qwen') => void;
  setLastMetrics: (m: ChatMetrics | null) => void;
  clearMessages: () => void;
  reset: () => void;
}

let _msgCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  messages: [],
  isLoading: false,
  provider: 'openai',
  lastMetrics: null,

  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: String(++_msgCounter), timestamp: Date.now() },
      ],
    })),
  setLoading: (v) => set({ isLoading: v }),
  setProvider: (p) => set({ provider: p }),
  setLastMetrics: (m) => set({ lastMetrics: m }),
  clearMessages: () => set({ messages: [] }),
  reset: () =>
    set({ sessionId: null, messages: [], isLoading: false, lastMetrics: null }),
}));
