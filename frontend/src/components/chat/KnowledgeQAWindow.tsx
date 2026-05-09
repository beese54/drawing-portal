import React, { useRef, useState } from 'react';
import { knowledgeApi } from '../../api/client';
import { useChatStore } from '../../store/chatStore';
import { ModelSelector } from './ModelSelector';

interface Citation {
  source: string;
  page: number | null;
  snippet: string;
  score: number;
}

interface QAMessage {
  id: string;
  role: 'user' | 'assistant';
  type?: 'answer' | 'question';  // 'question' = clarification request from model
  content: string;
  out_of_scope?: boolean;
  citations?: Citation[];
  confidence?: number;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastCostUsd: number;
  queryCount: number;
}

export function KnowledgeQAWindow() {
  const [messages, setMessages] = useState<QAMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      type: 'answer',
      content:
        'Ask me anything about the documents in the knowledge base — PUB Water Supply Regulations, the Application Handbook, or any other ingested reference. I will cite the exact page and source for every answer.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    lastInputTokens: 0,
    lastOutputTokens: 0,
    lastCostUsd: 0,
    queryCount: 0,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { provider } = useChatStore();

  function scrollToBottom() {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: QAMessage = { id: Date.now().toString(), role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await knowledgeApi.ask(question, provider, activeSessionId);
      const data = res.data;

      // Update token stats if we got token data (null-check, not truthiness — avoids 0 being falsy)
      if (data.input_tokens != null || data.output_tokens != null) {
        setTokenStats((prev) => ({
          totalInputTokens:  prev.totalInputTokens + (data.input_tokens ?? 0),
          totalOutputTokens: prev.totalOutputTokens + (data.output_tokens ?? 0),
          totalCostUsd:      prev.totalCostUsd + (data.cost_usd ?? 0),
          lastInputTokens:   data.input_tokens ?? 0,
          lastOutputTokens:  data.output_tokens ?? 0,
          lastCostUsd:       data.cost_usd ?? 0,
          queryCount:        prev.queryCount + 1,
        }));
      }

      if (data.type === 'question') {
        // Model needs clarification — store session, show clarification message
        setActiveSessionId(data.session_id ?? null);
        const assistantMsg: QAMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          type: 'question',
          content: data.answer,
          latency_ms: data.latency_ms,
          input_tokens: data.input_tokens,
          output_tokens: data.output_tokens,
          cost_usd: data.cost_usd,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Final answer — clear session
        setActiveSessionId(null);
        const assistantMsg: QAMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          type: 'answer',
          content: data.answer,
          out_of_scope: data.out_of_scope,
          citations: data.citations ?? [],
          confidence: data.confidence,
          latency_ms: data.latency_ms,
          input_tokens: data.input_tokens,
          output_tokens: data.output_tokens,
          cost_usd: data.cost_usd,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: unknown) {
      setActiveSessionId(null);
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'An error occurred.';
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${detail}` },
      ]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const inputPlaceholder = activeSessionId
    ? 'Answer the question above to continue… (Enter to send)'
    : 'Ask a question about the knowledge base… (Enter to send)';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {messages.map((msg) => (
            <QAMessageRow key={msg.id} msg={msg} />
          ))}
          {isLoading && (
            <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic', marginBottom: 8 }}>
              {activeSessionId ? 'Processing your answer…' : 'Searching knowledge base…'}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Clarification banner */}
        {activeSessionId && (
          <div
            style={{
              background: '#1e3a5f',
              borderTop: '1px solid #2563eb',
              borderBottom: '1px solid #2563eb',
              padding: '8px 16px',
              fontSize: 12,
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🔍</span>
            <span>Awaiting your clarification — answer the question above to get a precise answer.</span>
          </div>
        )}

        {/* Input */}
        <div
          style={{
            borderTop: activeSessionId ? 'none' : '1px solid #334155',
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={inputPlaceholder}
            rows={2}
            style={{
              flex: 1,
              background: '#1e293b',
              border: `1px solid ${activeSessionId ? '#2563eb' : '#334155'}`,
              borderRadius: 8,
              color: '#f1f5f9',
              fontSize: 14,
              padding: '8px 12px',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: input.trim() && !isLoading ? '#2563eb' : '#334155',
              color: input.trim() && !isLoading ? '#fff' : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              flexShrink: 0,
              height: 38,
            }}
          >
            {activeSessionId ? 'Reply' : 'Ask'}
          </button>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          borderLeft: '1px solid #334155',
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <ModelSelector />

        {/* Token cost panel */}
        <div
          style={{
            margin: '8px 12px 0',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            TOKEN USAGE
          </div>

          {tokenStats.queryCount === 0 ? (
            <p style={{ color: '#475569', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
              Cost tracking starts after your first query.
            </p>
          ) : (
            <>
              {/* Last query */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>LAST QUERY</div>
                <TokenRow label="In" value={tokenStats.lastInputTokens} unit="tok" color="#94a3b8" />
                <TokenRow label="Out" value={tokenStats.lastOutputTokens} unit="tok" color="#94a3b8" />
                <TokenRow
                  label="Cost"
                  value={`$${tokenStats.lastCostUsd.toFixed(6)}`}
                  color="#34d399"
                  bold
                />
              </div>

              <div style={{ height: 1, background: '#334155', margin: '6px 0' }} />

              {/* Session total */}
              <div>
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>
                  SESSION TOTAL ({tokenStats.queryCount} {tokenStats.queryCount === 1 ? 'query' : 'queries'})
                </div>
                <TokenRow
                  label="In"
                  value={tokenStats.totalInputTokens}
                  unit="tok"
                  color="#94a3b8"
                />
                <TokenRow
                  label="Out"
                  value={tokenStats.totalOutputTokens}
                  unit="tok"
                  color="#94a3b8"
                />
                <TokenRow
                  label="Cost"
                  value={`$${tokenStats.totalCostUsd.toFixed(6)}`}
                  color="#34d399"
                  bold
                />
              </div>
            </>
          )}
        </div>

        {/* Grounding info */}
        <div style={{ padding: '12px 16px' }}>
          <p style={{ color: '#64748b', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            Answers are grounded strictly in the ingested documents. The model will not
            speculate or use outside knowledge.
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            Each answer includes the source document and page number so you can verify
            directly.
          </p>
          <p style={{ color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
            When a question is ambiguous, the model will ask one clarifying question
            before answering (Recap technique — arXiv:2505.06120).
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token row helper
// ---------------------------------------------------------------------------

function TokenRow({
  label,
  value,
  unit,
  color,
  bold,
}: {
  label: string;
  value: number | string;
  unit?: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: bold ? 700 : 400 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span style={{ color: '#475569', marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual message row
// ---------------------------------------------------------------------------

function QAMessageRow({ msg }: { msg: QAMessage }) {
  const isUser = msg.role === 'user';
  const isClarification = msg.type === 'question';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
      }}
    >
      {/* Clarification label */}
      {isClarification && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#60a5fa',
            letterSpacing: '0.06em',
            marginBottom: 4,
          }}
        >
          CLARIFICATION NEEDED
        </div>
      )}

      {/* Bubble */}
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#2563eb' : isClarification ? '#1e3a5f' : '#1e293b',
          border: isClarification ? '1px solid #2563eb' : 'none',
          color: '#f1f5f9',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {renderText(msg.content)}
      </div>

      {/* Out-of-scope badge */}
      {msg.out_of_scope && (
        <div
          style={{
            marginTop: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#431407',
            border: '1px solid #c2410c',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: '#fb923c',
          }}
        >
          <span>⚠</span>
          <span>Outside knowledge base scope</span>
        </div>
      )}

      {/* Citation cards */}
      {!isUser && !msg.out_of_scope && msg.citations && msg.citations.length > 0 && (
        <div
          style={{ marginTop: 8, maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>
            SOURCES
          </div>
          {msg.citations.map((c, i) => (
            <CitationCard key={i} citation={c} />
          ))}
        </div>
      )}

      {/* Footer: latency / confidence / tokens */}
      {!isUser && msg.latency_ms !== undefined && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 4, display: 'flex', gap: 8 }}>
          {msg.confidence !== undefined && (
            <span>confidence {(msg.confidence * 100).toFixed(0)}%</span>
          )}
          <span>{msg.latency_ms.toFixed(0)} ms</span>
          {msg.input_tokens !== undefined && msg.input_tokens > 0 && (
            <span>
              {msg.input_tokens}↑ {msg.output_tokens}↓ tok
            </span>
          )}
          {msg.cost_usd !== undefined && msg.cost_usd > 0 && (
            <span style={{ color: '#34d399' }}>${msg.cost_usd.toFixed(6)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const pageLabel = citation.page != null ? `Page ${citation.page}` : 'Page unknown';
  const scoreLabel = `${(citation.score * 100).toFixed(0)}% match`;
  const shortName =
    citation.source.length > 40 ? citation.source.slice(0, 37) + '…' : citation.source;

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#94a3b8',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span>📄</span>
        <span style={{ flex: 1, color: '#cbd5e1', fontWeight: 500 }}>{shortName}</span>
        <span style={{ color: '#64748b' }}>{pageLabel}</span>
        <span
          style={{
            background: '#1e3a5f',
            color: '#60a5fa',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {scoreLabel}
        </span>
        <span style={{ color: '#475569', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div
          style={{
            marginTop: 8,
            color: '#64748b',
            lineHeight: 1.5,
            borderTop: '1px solid #1e293b',
            paddingTop: 8,
            fontStyle: 'italic',
          }}
        >
          "{citation.snippet}"
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text renderer (bold + newlines)
// ---------------------------------------------------------------------------

function renderText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/\*\*([^*]+)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part,
    );
    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}
