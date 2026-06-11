import { useEffect, useRef, useState } from 'react';
import { ANNOTATION_TEMPLATES } from '../../types';

type AnnotationSize = 'S' | 'M' | 'L';

const SIZE_CONFIG: Record<AnnotationSize, { fontSize: number; maxWidth: number; label: string }> = {
  S: { fontSize: 2,  maxWidth: 40, label: 'S' },
  M: { fontSize: 3,  maxWidth: 60, label: 'M' },
  L: { fontSize: 4,  maxWidth: 80, label: 'L' },
};

interface AnnotationContextMenuProps {
  viewportX: number;
  viewportY: number;
  onSelect: (text: string, fontSize: number, maxWidth: number) => void;
  onClose: () => void;
}

export function AnnotationContextMenu({ viewportX, viewportY, onSelect, onClose }: AnnotationContextMenuProps) {
  const [size, setSize] = useState<AnnotationSize>('M');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (customMode) textareaRef.current?.focus();
  }, [customMode]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    // Delay so the right-click that opened this menu finishes bubbling
    // before we listen for contextmenu — otherwise it closes itself instantly.
    const id = setTimeout(() => window.addEventListener('contextmenu', close), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [onClose]);

  const place = (text: string) => {
    const { fontSize, maxWidth } = SIZE_CONFIG[size];
    onSelect(text, fontSize, maxWidth);
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: viewportX,
    top: viewportY,
    zIndex: 200,
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 6,
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    minWidth: 240,
    padding: 4,
    userSelect: 'none',
  };

  return (
    <div style={menuStyle} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {/* Header + size selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 6px', borderBottom: '1px solid #eee', marginBottom: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Insert annotation
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['S', 'M', 'L'] as AnnotationSize[]).map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); setSize(s); }}
              style={{
                width: 22,
                height: 20,
                border: '1px solid',
                borderColor: size === s ? '#0066cc' : '#ddd',
                borderRadius: 3,
                background: size === s ? '#e8f0fe' : '#fafafa',
                color: size === s ? '#0066cc' : '#555',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Template rows */}
      {!customMode && ANNOTATION_TEMPLATES.map((t) => (
        <div
          key={t.id}
          onClick={(e) => { e.stopPropagation(); place(t.text); }}
          style={{ padding: '7px 10px', fontSize: 12, color: '#222', cursor: 'pointer', borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0f4ff'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          <span style={{ fontWeight: 600 }}>{t.label}</span>
          <span style={{ fontSize: 10, color: '#888', lineHeight: 1.3 }}>{t.text.slice(0, 60)}…</span>
        </div>
      ))}

      {/* Custom annotation input */}
      {customMode ? (
        <div style={{ padding: '6px 10px 8px' }}>
          <textarea
            ref={textareaRef}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type annotation text…"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (customText.trim()) place(customText.trim());
              }
              if (e.key === 'Escape') { setCustomMode(false); setCustomText(''); }
            }}
            style={{
              width: '100%',
              fontSize: 11,
              fontFamily: 'inherit',
              border: '1px solid #ccc',
              borderRadius: 3,
              padding: '4px 6px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setCustomMode(false); setCustomText(''); }}
              style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #ccc', borderRadius: 3, background: '#f5f5f5', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (customText.trim()) place(customText.trim()); }}
              disabled={!customText.trim()}
              style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #0066cc', borderRadius: 3, background: '#0066cc', color: '#fff', cursor: 'pointer', opacity: customText.trim() ? 1 : 0.5 }}
            >
              Place
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={(e) => { e.stopPropagation(); setCustomMode(true); }}
          style={{ padding: '7px 10px', fontSize: 12, color: '#0066cc', cursor: 'pointer', borderRadius: 3, borderTop: '1px solid #eee', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0f4ff'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          <span style={{ fontWeight: 600 }}>Custom text…</span>
        </div>
      )}
    </div>
  );
}
