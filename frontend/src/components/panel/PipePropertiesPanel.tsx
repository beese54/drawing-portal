import { useCanvasStore } from '../../store/canvasStore';
import type { NominalSizeMm, PipeMaterial } from '../../types';

const SIZE_OPTIONS = [15, 22, 28];
const MATERIAL_OPTIONS = [
  { value: 'copper', label: 'Copper' },
  { value: 'ss',     label: 'Stainless Steel' },
];

export function PipePropertiesPanel() {
  const { selectedId, pipes, updatePipeProperties } = useCanvasStore();

  const pipe = pipes.find((p) => p.id === selectedId);
  if (!pipe) return null;

  const update = (props: Parameters<typeof updatePipeProperties>[1]) =>
    updatePipeProperties(pipe.id, props);

  const handleLengthChange = (raw: string) => {
    const val = parseFloat(raw);
    update({ lengthM: isNaN(val) ? undefined : Math.max(0, Math.round(val * 100) / 100) });
  };

  const handleSizeChange = (raw: string) => {
    const val = parseFloat(raw);
    update({
      nominalSizeMm: isNaN(val)
        ? undefined
        : Math.max(0, Math.round(val * 100) / 100),
    });
  };

  const normalizeMaterial = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const cleaned = trimmed.toLowerCase();

    if (cleaned === 'copper') return 'copper';
    if (cleaned === 'stainless steel' || cleaned === 'steel' || cleaned === 'ss') return 'ss';

    return trimmed;
  };

  const handleMaterialChange = (raw: string) => {
    update({ material: normalizeMaterial(raw) });
  };

  return (
    <div style={{
      border: '1px solid #d1d5db',
      borderRadius: 6,
      padding: '10px 12px',
      marginBottom: 14,
      background: '#f8fafc',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 10,
      }}>
        Pipe Properties
      </div>

      {/* Length */}
      <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
        Real-World Length
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input
          type="number"
          min={0}
          step={0.1}
          value={pipe.lengthM ?? ''}
          placeholder="e.g. 5.0"
          onChange={(e) => handleLengthChange(e.target.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontSize: 13,
            background: '#fff',
            color: '#222',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 12, color: '#888', minWidth: 14 }}>m</span>
      </div>

      {/* Nominal Size */}
      <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
        Nominal Pipe Size
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input
          type="number"
          min={0}
          step={1}
          value={pipe.nominalSizeMm ?? ''}
          placeholder="e.g. 22"
          list="pipe-size-options"
          onChange={(e) => handleSizeChange(e.target.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontSize: 13,
            background: '#fff',
            color: '#222',
            outline: 'none',
          }}
        />
        <datalist id="pipe-size-options">
          {SIZE_OPTIONS.map((size) => (
            <option key={size} value={size} />
          ))}
        </datalist>
        <span style={{ fontSize: 12, color: '#888', minWidth: 24 }}>mm</span>
      </div>

      {/* Material */}
      <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
        Material
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          value={pipe.material ?? ''}
          placeholder="e.g. copper, ss, HDPE"
          list="pipe-material-options"
          onChange={(e) => handleMaterialChange(e.target.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontSize: 13,
            background: '#fff',
            color: '#222',
            outline: 'none',
          }}
        />
        <datalist id="pipe-material-options">
          {MATERIAL_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}
