import { useChatStore } from '../../store/chatStore';

export function ModelSelector() {
  const { provider, setProvider } = useChatStore();

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        LLM Model
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['openai', 'qwen'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 6,
              border: provider === p ? '2px solid #2563eb' : '2px solid #334155',
              background: provider === p ? '#1e3a5f' : '#1e293b',
              color: provider === p ? '#93c5fd' : '#94a3b8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {p === 'openai' ? 'GPT-4o-mini' : 'Qwen 7B'}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginTop: 6 }}>
        {provider === 'openai'
          ? 'OpenAI · $0.15/1M input tokens'
          : 'Together AI · Qwen2.5-7B · $0.20/1M tokens'}
      </div>
    </div>
  );
}
