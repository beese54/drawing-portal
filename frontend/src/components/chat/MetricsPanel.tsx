import { useChatStore } from '../../store/chatStore';
import type { ChatMetrics } from '../../store/chatStore';

interface MetricRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function MetricRow({ label, value, highlight }: MetricRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#64748b', fontSize: 11 }}>{label}</span>
      <span style={{ color: highlight ? '#34d399' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

interface RulesBadgeProps {
  fail: number;
  warn: number;
  pass: number;
}

function RulesBadge({ fail, warn, pass }: RulesBadgeProps) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      {fail > 0 && (
        <span style={{ background: '#450a0a', color: '#fca5a5', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
          {fail} FAIL
        </span>
      )}
      {warn > 0 && (
        <span style={{ background: '#451a03', color: '#fdba74', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
          {warn} WARN
        </span>
      )}
      {pass > 0 && (
        <span style={{ background: '#052e16', color: '#86efac', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
          {pass} PASS
        </span>
      )}
    </div>
  );
}

interface RulesListProps {
  items: ChatMetrics['rules_summary'] extends undefined ? never : NonNullable<ChatMetrics['rules_summary']>['items'];
}

function RulesList({ items }: RulesListProps) {
  const icons: Record<string, string> = { PASS: '✓', FAIL: '✗', WARN: '⚠', SKIP: '—' };
  const colors: Record<string, string> = {
    PASS: '#86efac', FAIL: '#fca5a5', WARN: '#fdba74', SKIP: '#64748b',
  };

  return (
    <div style={{ marginTop: 8 }}>
      {items.map((item) => (
        <div key={item.rule_id} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
          <span style={{ color: colors[item.status] || '#94a3b8', fontSize: 11, minWidth: 12 }}>
            {icons[item.status] || '?'}
          </span>
          <div>
            <div style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 600 }}>{item.description}</div>
            <div style={{ color: '#64748b', fontSize: 10 }}>{item.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MetricsPanel() {
  const { lastMetrics } = useChatStore();

  if (!lastMetrics) {
    return (
      <div style={{ padding: '12px 16px', borderTop: '1px solid #334155' }}>
        <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
          Metrics will appear after the first evaluation or chat query.
        </div>
      </div>
    );
  }

  const m = lastMetrics;
  const totalTokens = m.input_tokens + m.output_tokens;

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #334155' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Query Metrics
      </div>

      {/* Operational */}
      <MetricRow label="Tokens (in/out)" value={`${m.input_tokens} / ${m.output_tokens}`} />
      <MetricRow label="Total tokens" value={String(totalTokens)} />
      <MetricRow label="Cost" value={`$${m.cost_usd.toFixed(5)}`} highlight />
      <MetricRow label="Latency" value={`${m.latency_ms.toFixed(0)}ms`} />
      <MetricRow label="Tokens/sec" value={`${m.tokens_per_sec.toFixed(0)}`} />

      {/* RAG quality — only shown when a vector DB retrieval was involved */}
      {m.retrieved_chunks > 0 && (
        <>
          <div style={{ height: 1, background: '#334155', margin: '8px 0' }} />
          <MetricRow label="Chunks retrieved" value={String(m.retrieved_chunks)} />
          <MetricRow label="Top similarity" value={`${(m.top_similarity * 100).toFixed(1)}%`} />
          <MetricRow label="Mean similarity" value={`${(m.mean_similarity * 100).toFixed(1)}%`} />
          <MetricRow label="Faithfulness" value={`${(m.faithfulness * 100).toFixed(0)}%`} highlight />
        </>
      )}

      {/* Conversation quality */}
      <div style={{ height: 1, background: '#334155', margin: '8px 0' }} />
      <MetricRow label="Clarif. turns" value={String(m.clarification_turns)} />
      <MetricRow label="Recap used" value={m.recap_used ? 'Yes' : 'No'} />

      {/* Rules summary */}
      {m.rules_summary && (
        <>
          <div style={{ height: 1, background: '#334155', margin: '8px 0' }} />
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
            Compliance Checks
          </div>
          <RulesBadge
            fail={m.rules_summary.fail}
            warn={m.rules_summary.warn}
            pass={m.rules_summary.pass}
          />
          <RulesList items={m.rules_summary.items} />
        </>
      )}
    </div>
  );
}
