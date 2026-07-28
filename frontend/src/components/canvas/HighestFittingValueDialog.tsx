import { useState } from 'react';

interface HighestFittingValueDialogProps {
  /** Present when editing an already-placed marker; absent right after placement. */
  initialValueM?: number;
  onConfirm: (elevationM: number) => void;
  onCancel: () => void;
}

export function HighestFittingValueDialog({ initialValueM, onConfirm, onCancel }: HighestFittingValueDialogProps) {
  const [draft, setDraft] = useState(initialValueM !== undefined ? String(initialValueM) : '');
  const parsed = parseFloat(draft);
  const isValid = draft.trim().length > 0 && Number.isFinite(parsed);

  const confirm = () => { if (isValid) onConfirm(parsed); };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: '24px 28px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        minWidth: 300,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#1a3a5c' }}>
          Highest Direct Supply Fitting
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
          Enter the elevation of the highest fitting on direct supply (m AMSL).
        </div>

        <input
          type="number"
          step="any"
          autoFocus
          value={draft}
          placeholder="e.g. 22.5"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            fontSize: 14, border: '1px solid #ccc', borderRadius: 6,
            marginBottom: 20, textAlign: 'center',
          }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 20px', border: '1px solid #ccc', borderRadius: 6,
              background: '#f5f5f5', cursor: 'pointer', fontSize: 13, color: '#555',
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!isValid}
            style={{
              padding: '7px 20px', border: '1px solid #0066cc', borderRadius: 6,
              background: isValid ? '#0066cc' : '#9cc3e8', color: '#fff',
              cursor: isValid ? 'pointer' : 'default', fontSize: 13, fontWeight: 600,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
