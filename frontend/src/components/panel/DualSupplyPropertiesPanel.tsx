import { useCanvasStore } from '../../store/canvasStore';
import { DUAL_SUPPLY_SYMBOLS } from '../../utils/symbolPorts';

export function DualSupplyPropertiesPanel() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const elements = useCanvasStore((s) => s.elements);
  const setDualSupply = useCanvasStore((s) => s.setDualSupply);
  const setSwapDualSupply = useCanvasStore((s) => s.setSwapDualSupply);

  const el = elements.find((e) => e.id === selectedId);
  if (!el || !DUAL_SUPPLY_SYMBOLS.has(el.symbolId)) return null;

  const enabled = el.dualSupply ?? false;
  const swapped = el.swapDualSupply ?? false;

  const checkboxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 13,
    color: '#333',
    userSelect: 'none',
  };

  return (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #eee' }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        Supply Ports
      </div>

      <label style={checkboxStyle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDualSupply(el.id, e.target.checked)}
          style={{ width: 14, height: 14, cursor: 'pointer' }}
        />
        Dual supply (hot + cold)
      </label>

      {enabled && (
        <>
          <label style={{ ...checkboxStyle, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={swapped}
              onChange={(e) => setSwapDualSupply(el.id, e.target.checked)}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
            Swap sides (hot on left)
          </label>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.5 }}>
            {swapped
              ? 'Hot (left) · Cold (right)'
              : 'Cold (left) · Hot (right)'}
          </div>
        </>
      )}
    </div>
  );
}
