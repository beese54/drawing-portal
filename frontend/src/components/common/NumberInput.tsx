import { useState, useEffect } from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export function NumberInput({ label, value, onChange, min, max, step = 1, unit }: NumberInputProps) {
  const [raw, setRaw] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setRaw(text);
    const num = parseFloat(text);
    if (isNaN(num)) {
      setError('Must be a number');
    } else if (num < min) {
      setError(`Min ${min}`);
    } else if (num > max) {
      setError(`Max ${max}`);
    } else {
      setError(null);
      onChange(num);
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 3 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={raw}
          min={min}
          max={max}
          step={step}
          onChange={handleChange}
          style={{
            width: '100%',
            padding: '5px 8px',
            border: `1px solid ${error ? '#e53e3e' : '#ccc'}`,
            borderRadius: 4,
            fontSize: 13,
            outline: 'none',
          }}
        />
        {unit && <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
      {error && <div style={{ fontSize: 11, color: '#e53e3e', marginTop: 2 }}>{error}</div>}
    </div>
  );
}
