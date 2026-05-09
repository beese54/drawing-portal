import { useState } from 'react';
import { SYMBOL_PORTS, rotateOffset } from '../../utils/symbolPorts';

interface TeeJunctionPortDialogProps {
  onConfirm: (inletIndices: number[], rotation: number) => void;
  onCancel: () => void;
}

const BASE_PORTS = SYMBOL_PORTS['tee_junction'] ?? [];

// Diagram is 200×200; scale port offsets (±24px) to ±64px from centre
const SCALE = 64 / 24;
const CENTER = 100;

function portScreenPos(portIndex: number, rotation: number) {
  const port = BASE_PORTS[portIndex];
  const r = rotateOffset(
    Math.round(port.offsetX * SCALE),
    Math.round(port.offsetY * SCALE),
    rotation
  );
  return { x: CENTER + r.x, y: CENTER + r.y };
}

export function TeeJunctionPortDialog({ onConfirm, onCancel }: TeeJunctionPortDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [inletCount, setInletCount] = useState<1 | 2>(1);
  const [selectedInlets, setSelectedInlets] = useState<number[]>([]);

  function togglePort(i: number) {
    setSelectedInlets((prev) => {
      if (prev.includes(i)) {
        // Deselect
        return prev.filter((x) => x !== i);
      }
      if (prev.length < inletCount) {
        return [...prev, i];
      }
      // Replace oldest selection if at capacity
      return [...prev.slice(1), i];
    });
  }

  function handleInletCountChange(count: 1 | 2) {
    setInletCount(count);
    // Trim selection to new count
    setSelectedInlets((prev) => prev.slice(0, count));
  }

  const canConfirm = selectedInlets.length === inletCount;

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
        minWidth: 320,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#1a3a5c' }}>
          Tee Junction Setup
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
          Choose orientation and number of inlets, then select the inlet port(s).
        </div>

        {/* Inlet count toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#444', alignSelf: 'center' }}>Inlets:</span>
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => handleInletCountChange(n)}
              style={{
                width: 36, height: 30,
                borderRadius: 6,
                border: inletCount === n ? '2px solid #1a3a5c' : '1px solid #ccc',
                background: inletCount === n ? '#1a3a5c' : '#f5f5f5',
                color: inletCount === n ? '#fff' : '#555',
                cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Rotation selector */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => { setRotation((prev) => (prev + 270) % 360); setSelectedInlets([]); }}
            title="Rotate 90° clockwise"
            style={{
              width: 44, height: 44,
              borderRadius: 6,
              border: '1px solid #ccc',
              background: '#f5f5f5',
              color: '#1a3a5c',
              cursor: 'pointer',
              fontSize: 22, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↻
          </button>
        </div>

        {/* Diagram: T-shape + 3 port dots */}
        <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 20px', userSelect: 'none' }}>
          <svg
            width={200} height={200}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <g transform={`rotate(${rotation}, ${CENTER}, ${CENTER})`}>
              {/* Horizontal pipe */}
              <line x1={36} y1={CENTER} x2={164} y2={CENTER}
                stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" />
              {/* Vertical branch (downward) */}
              <line x1={CENTER} y1={CENTER} x2={CENTER} y2={164}
                stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" />
            </g>
          </svg>

          {/* Clickable port buttons */}
          {BASE_PORTS.map((_, i) => {
            const pos = portScreenPos(i, rotation);
            const isSelected = selectedInlets.includes(i);
            return (
              <button
                key={i}
                onClick={() => togglePort(i)}
                title={isSelected ? 'Click to deselect' : 'Click to set as inlet'}
                style={{
                  position: 'absolute',
                  left: pos.x - 16,
                  top: pos.y - 16,
                  width: 32, height: 32,
                  borderRadius: '50%',
                  border: isSelected ? '2px solid #007bff' : '2px solid #aaa',
                  background: isSelected ? '#007bff' : '#f0f4ff',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  color: isSelected ? '#fff' : '#555',
                  transition: 'all 0.15s',
                  zIndex: 1,
                }}
              >
                {isSelected ? 'IN' : '●'}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>
          {canConfirm
            ? `${inletCount} inlet${inletCount > 1 ? 's' : ''} selected — ready to confirm`
            : `Select ${inletCount - selectedInlets.length} more inlet${inletCount - selectedInlets.length > 1 ? 's' : ''}`}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button
            onClick={() => onConfirm(selectedInlets, rotation)}
            disabled={!canConfirm}
            style={{
              padding: '7px 20px',
              border: 'none',
              borderRadius: 6,
              background: canConfirm ? '#1a3a5c' : '#ccc',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
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
