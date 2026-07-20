import { useState } from 'react';
import { feedbackApi } from '../../api/client';

interface Props {
  onSubmit: () => void;
}

const RATINGS = [1, 2, 3, 4, 5];

export function FeedbackModal({ onSubmit }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackApi.submit({ rating, comments });
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          width: 'min(420px, calc(100vw - 32px))',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>
            Quick Feedback (Temporary)
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
            We're gathering early feedback while testing this tool. Please rate your
            experience so far before continuing to the evaluation.
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 8 }}>
            How has your experience been so far?
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {RATINGS.map((r) => (
              <button
                key={r}
                onClick={() => setRating(r)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6,
                  border: rating === r ? '1px solid #7c3aed' : '1px solid #d1d5db',
                  background: rating === r ? '#f5f3ff' : '#fff',
                  color: rating === r ? '#7c3aed' : '#374151',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>Poor</span>
            <span>Excellent</span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 6 }}>
            Any comments? (optional)
          </div>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="What's working, what's confusing, what's missing..."
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6,
              border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {error && (
            <div style={{ fontSize: 11, color: '#e53e3e', marginTop: 8 }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSubmit}
            disabled={rating === null || submitting}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 6,
              background: rating !== null && !submitting ? '#7c3aed' : '#ccc',
              color: '#fff', cursor: rating !== null && !submitting ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
