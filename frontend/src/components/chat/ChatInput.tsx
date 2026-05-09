import { useRef, ChangeEvent } from 'react';

interface Props {
  onAttachSchematic: (file: File) => void;
  onAttachImage: (file: File) => void;
  onEvaluate: () => void;
  disabled?: boolean;
  hasSchematic?: boolean;
  hasImage?: boolean;
  attachedFileName?: string;
  attachedImageName?: string;
}

export function ChatInput({
  onAttachSchematic,
  onAttachImage,
  onEvaluate,
  disabled,
  hasSchematic,
  hasImage,
  attachedFileName,
  attachedImageName,
}: Props) {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const jpgInputRef = useRef<HTMLInputElement>(null);

  const handleJsonChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachSchematic(file);
      e.target.value = '';
    }
  };

  const handleJpgChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachImage(file);
      e.target.value = '';
    }
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid #334155',
        background: '#0f172a',
      }}
    >
      {/* Hidden file inputs */}
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleJsonChange}
      />
      <input
        ref={jpgInputRef}
        type="file"
        accept="image/jpeg,image/jpg"
        style={{ display: 'none' }}
        onChange={handleJpgChange}
      />

      {/* Attachment buttons row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {/* JSON upload button */}
        <button
          onClick={() => jsonInputRef.current?.click()}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 6,
            border: '1px dashed #334155',
            background: hasSchematic ? '#052e16' : '#1e293b',
            color: hasSchematic ? '#86efac' : '#64748b',
            fontSize: 12,
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            overflow: 'hidden',
          }}
        >
          <span>{hasSchematic ? '✓' : '📄'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasSchematic && attachedFileName
              ? attachedFileName
              : 'Upload schematic JSON'}
          </span>
        </button>

        {/* JPG upload button */}
        <button
          onClick={() => jpgInputRef.current?.click()}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 6,
            border: '1px dashed #334155',
            background: hasImage ? '#1e3a5f' : '#1e293b',
            color: hasImage ? '#93c5fd' : '#64748b',
            fontSize: 12,
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            overflow: 'hidden',
          }}
        >
          <span>{hasImage ? '✓' : '🖼'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasImage && attachedImageName
              ? attachedImageName
              : 'Upload schematic JPG (optional)'}
          </span>
        </button>
      </div>

      {/* Evaluate button — only shown when JSON is attached */}
      {hasSchematic && (
        <button
          onClick={onEvaluate}
          disabled={disabled}
          style={{
            width: '100%',
            marginBottom: 8,
            padding: '9px 12px',
            borderRadius: 6,
            border: 'none',
            background: disabled ? '#334155' : '#2563eb',
            color: disabled ? '#64748b' : '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
            letterSpacing: 0.3,
          }}
        >
          {disabled ? 'Evaluating…' : 'Run Compliance Evaluation'}
        </button>
      )}

    </div>
  );
}
