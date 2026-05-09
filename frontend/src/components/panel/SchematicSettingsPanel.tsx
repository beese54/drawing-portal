// Currently unused as we do not provide such infomation neither do we request for such information from the LP/QP.

import { useCanvasStore } from '../../store/canvasStore';

export function SchematicSettingsPanel() {
  // const sourcePressureBar = useCanvasStore((s) => s.sourcePressureBar);
  // const setSourcePressure = useCanvasStore((s) => s.setSourcePressure);

  // const handleChange = (raw: string) => {
  //   const val = parseFloat(raw);
  //   setSourcePressure(isNaN(val) ? null : Math.max(0, Math.round(val * 100) / 100));
  // };

  // return (
  //   <div style={{ marginBottom: 14 }}>
  //     <div style={{
  //       fontSize: 11,
  //       fontWeight: 700,
  //       color: '#555',
  //       textTransform: 'uppercase',
  //       letterSpacing: '0.06em',
  //       marginBottom: 8,
  //     }}>
  //       Schematic Settings
  //     </div>

  //     <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
  //       Source / Mains Pressure
  //     </label>
  //     <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  //       <input
  //         type="number"
  //         min={0}
  //         step={0.1}
  //         value={sourcePressureBar ?? ''}
  //         placeholder="e.g. 3.0"
  //         onChange={(e) => handleChange(e.target.value)}
  //         style={{
  //           flex: 1,
  //           padding: '5px 8px',
  //           border: '1px solid #ccc',
  //           borderRadius: 4,
  //           fontSize: 13,
  //           background: '#fff',
  //           color: '#222',
  //           outline: 'none',
  //         }}
  //       />
  //       <span style={{ fontSize: 12, color: '#888', minWidth: 24 }}>bar</span>
  //     </div>
  //     <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
  //       Typical mains: 2–4 bar
  //     </div>

  //     <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0 0' }} />
  //   </div>
  // );
}
