import { useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import type { NominalSizeMm, PipeMaterial } from '../../types';

interface Props {
  pipeId: string;
  onConfirm: () => void;
  onDiscard: () => void;
}

const SIZE_OPTIONS: NominalSizeMm[] = [15, 22, 28];

const MATERIAL_OPTIONS: { value: PipeMaterial; label: string }[] = [
  { value: 'copper', label: 'Copper' },
  { value: 'ss',     label: 'Stainless Steel' },
  { value: 'pvc',    label: 'PVC' },
  { value: 'upvc',   label: 'uPVC' },
];

export function PipePropertiesModal({ pipeId, onConfirm, onDiscard }: Props) {
  const pipe = useCanvasStore((s) => s.pipes.find((p) => p.id === pipeId));
  const updatePipeProperties = useCanvasStore((s) => s.updatePipeProperties);

  const [lengthRaw, setLengthRaw] = useState('');
  const [size, setSize] = useState<NominalSizeMm | null>(pipe?.nominalSizeMm ?? null);
  const [material, setMaterial] = useState<PipeMaterial | null>(pipe?.material ?? null);
  const [customMaterial, setCustomMaterial] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [touched, setTouched] = useState(false);

  if (!pipe) return null;

  const lengthVal = parseFloat(lengthRaw);
  const lengthOk = !isNaN(lengthVal) && lengthVal > 0;
  const hasMaterial = material !== null || customMaterial.trim() !== '';

  const parsedCustomSize = parseFloat(customSize);

  const hasSize =
    size !== null ||
    (!isNaN(parsedCustomSize) && parsedCustomSize > 0);

  const allFilled = lengthOk && hasSize && hasMaterial;

  function normalizeSize(): number | null {
    if (size !== null) return size;

    const parsed = parseFloat(customSize);
    if (!isNaN(parsed) && parsed > 0) return parsed;

    return null;
  }

  function normalizeMaterial(): string {
    if (material) return material; // predefined

    const input = customMaterial.trim().toLowerCase();

    if (input.includes('copper')) return 'copper';
    if (input.includes('steel')) return 'ss';

    return customMaterial.trim(); // fallback
  }

  const handleConfirm = () => {
    setTouched(true);
    if (!allFilled) return;
    updatePipeProperties(pipeId, {
      lengthM: lengthVal,
      nominalSizeMm: normalizeSize() as any,
      material: normalizeMaterial() as any,
    });
    onConfirm();
  };

  return (
    /* Full-screen backdrop */
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: '24px 28px',
        width: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111' }}>
          Pipe Properties
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#666' }}>
          Fill in all fields to keep this pipe. All fields are required.
        </p>

        {/* Length */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>
          Real-World Length <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: touched && !lengthOk ? 4 : 14 }}>
          <input
            autoFocus
            type="number"
            min={0.01}
            step={0.1}
            value={lengthRaw}
            placeholder="e.g. 5.0"
            onChange={(e) => setLengthRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            style={{
              flex: 1,
              padding: '7px 10px',
              border: `1px solid ${touched && !lengthOk ? '#dc2626' : '#d1d5db'}`,
              borderRadius: 5,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 13, color: '#888', minWidth: 20 }}>m</span>
        </div>
        {touched && !lengthOk && (
          <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 10 }}>
            Enter a length greater than 0.
          </div>
        )}

        {/* Size */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>
          Nominal Pipe Size <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: touched && !size ? 4 : 14 }}>
          {SIZE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSize(s); 
                setCustomSize('');}}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: 5,
                border: size === s
                  ? '2px solid #2563eb'
                  : `1px solid ${touched && !size ? '#dc2626' : '#d1d5db'}`,
                background: size === s ? '#eff6ff' : '#fff',
                color: size === s ? '#1d4ed8' : '#374151',
                fontSize: 13,
                fontWeight: size === s ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {s}mm
            </button>
          ))}
        </div>
        <input
          type="number"
          min = "0.01"
          placeholder="Or enter size (mm)"
          value={customSize}
          onChange={(e) => {
            setCustomSize(e.target.value);
            setSize(null); // deselect buttons
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 5,
            border: '1px solid #d1d5db',
            fontSize: 13,
            marginBottom: 20,
          }}
        />
        {touched && !size && (
          <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 10 }}>
            Select a pipe size.
          </div>
        )}

        {/* Material */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>
          Material <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: touched && !material ? 4 : 20 }}>
          {MATERIAL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                setMaterial(value);
                setCustomMaterial(''); // clear custom input
              }}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: 5,
                border: material === value
                  ? '2px solid #16a34a'
                  : `1px solid ${touched && !material ? '#dc2626' : '#d1d5db'}`,
                background: material === value ? '#f0fdf4' : '#fff',
                color: material === value ? '#15803d' : '#374151',
                fontSize: 13,
                fontWeight: material === value ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
            
          ))}
        </div>
        <input
                type="text"
                placeholder="Or enter custom material"
                value={customMaterial}
                onChange={(e) => {
                  setCustomMaterial(e.target.value);
                  setMaterial(null); // deselect predefined
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: '1px solid #d1d5db',
                  fontSize: 13,
                  marginBottom: 20,
                }}
              />
        {touched && !hasMaterial  && (
          <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 14 }}>
            Select a material.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onDiscard}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: '#f9fafb',
              color: '#374151',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Discard Pipe
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 6,
              border: 'none',
              background: allFilled ? '#2563eb' : '#93c5fd',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: allFilled ? 'pointer' : 'default',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
