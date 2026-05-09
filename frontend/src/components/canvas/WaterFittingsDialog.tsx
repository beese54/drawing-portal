import { useState } from 'react';
import { WATER_FITTING_TYPES } from '../../types';

interface WaterFittingsDialogProps {
  onConfirm: (fittingTypeId: string, efficiencyRating: 2 | 3) => void;
  onCancel: () => void;
}

const TICK = '✓';

export function WaterFittingsDialog({ onConfirm, onCancel }: WaterFittingsDialogProps) {
  const [selected, setSelected]   = useState(WATER_FITTING_TYPES[0].id);
  const [rating, setRating]       = useState<2 | 3>(3);

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
        {/* Fitting type */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#1a3a5c' }}>
          Water Fitting Type
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
          Select the type of fitting this symbol represents.
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 13,
            marginBottom: 24,
            color: '#333',
          }}
        >
          {WATER_FITTING_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.code} — {type.label}
            </option>
          ))}
        </select>

        {/* Water efficiency rating */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#1a3a5c' }}>
          Water Efficiency Rating
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
          Select the number of ticks for this fitting.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          {([2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              style={{
                padding: '10px 22px',
                borderRadius: 6,
                border: rating === n ? '2px solid #1a3a5c' : '1px solid #ccc',
                background: rating === n ? '#1a3a5c' : '#f5f5f5',
                color: rating === n ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'Arial, sans-serif',
                transition: 'all 0.15s',
              }}
            >
              {n} {TICK.repeat(n)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button
            onClick={() => onConfirm(selected, rating)}
            style={{
              padding: '7px 20px',
              border: 'none',
              borderRadius: 6,
              background: '#1a3a5c',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 20px',
              border: '1px solid #ccc',
              borderRadius: 6,
              background: '#f5f5f5',
              cursor: 'pointer',
              fontSize: 13,
              color: '#555',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
