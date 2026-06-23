import { useRef, useEffect } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { FIXTURE_MWELS_CATEGORY, WATER_FITTING_TYPES, SCHEMATIC_SYMBOL_PX } from '../../types';
import { DUAL_SUPPLY_SYMBOLS } from '../../utils/symbolPorts';

const TICK = '✓';

interface Props {
  elementId: string;
  x: number;
  y: number;
  elementHalfWidthVp?: number;
  onClose: () => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: '8px 10px 10px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  border: '1px solid #ccc',
  pointerEvents: 'all',
  minWidth: 160,
  maxWidth: 220,
};

export function SymbolPropertiesModal({ elementId, x, y, elementHalfWidthVp = SCHEMATIC_SYMBOL_PX / 2, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const elements             = useCanvasStore((s) => s.elements);
  const setDualSupply        = useCanvasStore((s) => s.setDualSupply);
  const setSwapDualSupply    = useCanvasStore((s) => s.setSwapDualSupply);
  const updateEfficiencyRating = useCanvasStore((s) => s.updateEfficiencyRating);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const el = elements.find((e) => e.id === elementId);
  if (!el) return null;

  const showDualSupply = DUAL_SUPPLY_SYMBOLS.has(el.symbolId);

  const fixedCategory  = FIXTURE_MWELS_CATEGORY[el.symbolId];
  const isMwelsFixture = el.symbolId in FIXTURE_MWELS_CATEGORY;
  const isMwelsFitting = el.symbolId === 'water_fittings' && !!el.fittingType;
  const showMwels      = isMwelsFixture || isMwelsFitting;

  const categoryLabel = fixedCategory
    ? WATER_FITTING_TYPES.find((t) => t.id === fixedCategory)?.label
    : WATER_FITTING_TYPES.find((t) => t.id === el.fittingType)?.label;

  const enabled = el.dualSupply ?? false;
  const swapped = el.swapDualSupply ?? false;

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + elementHalfWidthVp + 18,
    top: y - elementHalfWidthVp,
  };

  return (
    <div ref={panelRef} style={posStyle}>
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {el.symbolName}
      </div>

      {/* Dual supply section */}
      {showDualSupply && (
        <div style={{ marginBottom: showMwels ? 8 : 0, paddingBottom: showMwels ? 8 : 0, borderBottom: showMwels ? '1px solid #eee' : 'none' }}>
          <div style={sectionLabel}>Supply Ports</div>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setDualSupply(el.id, e.target.checked)}
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
                  onChange={(e) => setSwapDualSupply(el.id, e.target.checked)}
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
      )}

      {/* MWELS section */}
      {showMwels && (
        <div style={{ marginTop: showDualSupply ? 8 : 0 }}>
          <div style={sectionLabel}>Water Efficiency</div>
          {!fixedCategory && categoryLabel && (
            <div style={{
              fontSize: 10, color: '#374151',
              background: '#f3f4f6', borderRadius: 4,
              padding: '3px 6px', textAlign: 'center',
              marginBottom: 6, userSelect: 'none',
            }}>
              {categoryLabel}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {([2, 3] as const).map((n) => (
              <button
                key={n}
                onClick={(e) => { e.stopPropagation(); updateEfficiencyRating(el.id, n); }}
                style={{
                  flex: 1, padding: '6px 0',
                  borderRadius: 4,
                  border: el.efficiencyRating === n ? '2px solid #1a3a5c' : '1px solid #ddd',
                  background: el.efficiencyRating === n ? '#1a3a5c' : '#f5f5f5',
                  color: el.efficiencyRating === n ? '#fff' : '#333',
                  cursor: 'pointer', fontSize: 11, fontWeight: 700,
                }}
              >
                {n} {TICK.repeat(n)}
              </button>
            ))}
          </div>
          {!el.efficiencyRating && (
            <div style={{ fontSize: 10, color: '#b45309', marginTop: 6, textAlign: 'center', userSelect: 'none' }}>
              Select a tick rating
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#666',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 6,
};

const checkboxRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  cursor: 'pointer', fontSize: 11, color: '#333', userSelect: 'none',
};
