import { useState } from 'react';
import { feedbackApi } from '../../api/client';

interface Props {
  onSubmit: () => void;
  onCancel: () => void;
}

const SCALE = [1, 2, 3, 4, 5];

interface RatingScaleProps {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number) => void;
}

function RatingScale({ label, lowLabel, highLabel, value, onChange }: RatingScaleProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {SCALE.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6,
              border: value === r ? '1px solid #7c3aed' : '1px solid #d1d5db',
              background: value === r ? '#f5f3ff' : '#fff',
              color: value === r ? '#7c3aed' : '#374151',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export function FeedbackModal({ onSubmit, onCancel }: Props) {
  const [overallSatisfaction, setOverallSatisfaction] = useState<number | null>(null);
  const [likelihoodToUseAgain, setLikelihoodToUseAgain] = useState<number | null>(null);
  const [easeOfUse, setEaseOfUse] = useState<number | null>(null);
  const [confusion, setConfusion] = useState('');
  const [wishedFeatures, setWishedFeatures] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRated = overallSatisfaction !== null && likelihoodToUseAgain !== null && easeOfUse !== null;

  const handleSubmit = async () => {
    if (!allRated) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackApi.submit({
        overall_satisfaction: overallSatisfaction!,
        likelihood_to_use_again: likelihoodToUseAgain!,
        ease_of_use: easeOfUse!,
        confusion,
        wished_features: wishedFeatures,
      });
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
          width: 'min(460px, calc(100vw - 32px))',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>
              Quick Feedback (Temporary)
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
              We're gathering early feedback while testing this tool. Please answer a
              few quick questions before continuing to the export.
            </div>
          </div>
          <button
            onClick={onCancel}
            title="Cancel"
            style={{
              background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
              color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: '4px 10px',
              flexShrink: 0, marginLeft: 12,
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <RatingScale
            label="Overall, how satisfied are you with the portal?"
            lowLabel="Not satisfied"
            highLabel="Very satisfied"
            value={overallSatisfaction}
            onChange={setOverallSatisfaction}
          />
          <RatingScale
            label="How likely would you use this portal for your own drawings in future?"
            lowLabel="Not likely"
            highLabel="Very likely"
            value={likelihoodToUseAgain}
            onChange={setLikelihoodToUseAgain}
          />
          <RatingScale
            label="How easy was it to use the portal?"
            lowLabel="Not easy"
            highLabel="Very easy"
            value={easeOfUse}
            onChange={setEaseOfUse}
          />

          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 6 }}>
            What confused you? (optional)
          </div>
          <textarea
            value={confusion}
            onChange={(e) => setConfusion(e.target.value)}
            rows={2}
            placeholder="Anything that didn't make sense..."
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6,
              border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 14,
            }}
          />

          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 6 }}>
            Any features you wished existed? (optional)
          </div>
          <textarea
            value={wishedFeatures}
            onChange={(e) => setWishedFeatures(e.target.value)}
            rows={2}
            placeholder="Anything missing that would help..."
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
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px', border: '1px solid #d1d5db',
              borderRadius: 6, background: '#f9fafb', color: '#374151',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allRated || submitting}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 6,
              background: allRated && !submitting ? '#7c3aed' : '#ccc',
              color: '#fff', cursor: allRated && !submitting ? 'pointer' : 'not-allowed',
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
