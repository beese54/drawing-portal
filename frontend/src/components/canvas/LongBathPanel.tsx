import { useState, useEffect, useRef } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { SCHEMATIC_SYMBOL_PX } from '../../types';

interface LongBathPanelProps {
  elementId: string;
  x: number;
  y: number;
  currentCapacityL?: number;
  dualSupply?: boolean;
  swapDualSupply?: boolean;
  elementHalfWidthVp?: number;
  onClose?: () => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: '8px 10px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  border: '1px solid #ccc',
  pointerEvents: 'all',
  minWidth: 180,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#666',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 4,
};

const checkboxRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  cursor: 'pointer', fontSize: 11, color: '#333', userSelect: 'none',
};

export function LongBathPanel({ elementId, x, y, currentCapacityL, dualSupply, swapDualSupply, elementHalfWidthVp = SCHEMATIC_SYMBOL_PX / 2, onClose }: LongBathPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const updateLongBathCapacity = useCanvasStore((s) => s.updateLongBathCapacity);
  const setDualSupply          = useCanvasStore((s) => s.setDualSupply);
  const setSwapDualSupply      = useCanvasStore((s) => s.setSwapDualSupply);
  const [inputValue, setInputValue] = useState(currentCapacityL !== undefined ? String(currentCapacityL) : '');

  useEffect(() => {
    setInputValue(currentCapacityL !== undefined ? String(currentCapacityL) : '');
  }, [elementId, currentCapacityL]);

  useEffect(() => {
    if (!onClose) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const commit = () => {
    const v = parseFloat(inputValue);
    if (!isNaN(v) && v > 0) updateLongBathCapacity(elementId, v);
  };

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + elementHalfWidthVp + 22,
    top: y - elementHalfWidthVp,
  };

  const enabled = dualSupply ?? false;
  const swapped = swapDualSupply ?? false;

  return (
    <div ref={panelRef} style={posStyle}>
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        Long Bath
      </div>

      {/* Capacity section */}
      <div style={{ paddingBottom: 8, borderBottom: '1px solid #eee' }}>
        <div style={sectionLabel}>Capacity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={1}
            step={1}
            value={inputValue}
            onChange={(e) => { e.stopPropagation(); setInputValue(e.target.value); }}
            onBlur={commit}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="e.g. 200"
            style={{
              width: 80,
              padding: '4px 6px',
              borderRadius: 4,
              border: '1px solid #ddd',
              fontSize: 12,
              color: '#333',
            }}
          />
          <span style={{ fontSize: 11, color: '#555', userSelect: 'none' }}>L</span>
        </div>
        {currentCapacityL !== undefined && (
          <div style={{
            fontSize: 10,
            color: currentCapacityL > 250 ? '#b45309' : '#166534',
            fontWeight: 600,
            marginTop: 4,
          }}>
            {currentCapacityL > 250 ? `⚠ ${currentCapacityL} L > 250 L limit` : `✓ ${currentCapacityL} L — within limit`}
          </div>
        )}
      </div>

      {/* Supply ports section */}
      <div>
        <div style={sectionLabel}>Supply Ports</div>
        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { e.stopPropagation(); setDualSupply(elementId, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 12, height: 12, cursor: 'pointer' }}
          />
          Dual supply (hot + cold)
        </label>
        {enabled && (
          <>
            <label style={{ ...checkboxRow, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={swapped}
                onChange={(e) => { e.stopPropagation(); setSwapDualSupply(elementId, e.target.checked); }}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 12, height: 12, cursor: 'pointer' }}
              />
              Swap sides (hot on left)
            </label>
            <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
              {swapped ? 'Hot (left) · Cold (right)' : 'Cold (left) · Hot (right)'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
