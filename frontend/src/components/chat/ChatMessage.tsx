import React from 'react';
import type { ChatMessage as ChatMessageType } from '../../store/chatStore';
import { EvaluationReport } from './EvaluationReport';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#2563eb' : '#1e293b',
          color: '#f1f5f9',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {renderContent(message.content)}
      </div>

      {/* Structured evaluation report */}
      {message.evaluationResult && (
        <EvaluationReport result={message.evaluationResult} />
      )}

      {/* Metrics badge for final answers */}
      {message.metrics && (
        <div
          style={{
            fontSize: 11,
            color: '#64748b',
            marginTop: 4,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>{message.metrics.model}</span>
          <span>|</span>
          <span>{message.metrics.input_tokens + message.metrics.output_tokens} tokens</span>
          <span>|</span>
          <span>${message.metrics.cost_usd.toFixed(5)}</span>
          <span>|</span>
          <span>{message.metrics.latency_ms.toFixed(0)}ms</span>
          {message.metrics.faithfulness !== undefined && (
            <>
              <span>|</span>
              <span>faithfulness {(message.metrics.faithfulness * 100).toFixed(0)}%</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Render markdown-lite: bold, bullet lists */
function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold: **text**
    const parts = line.split(/\*\*([^*]+)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
    );
    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}
