import { useEffect } from 'react';
import { useClampToViewport } from '../../hooks/useClampToViewport';

interface MirrorContextMenuProps {
  viewportX: number;
  viewportY: number;
  onMirror: (axis: 'horizontal' | 'vertical') => void;
  onClose: () => void;
}

export function MirrorContextMenu({ viewportX, viewportY, onMirror, onClose }: MirrorContextMenuProps) {
  const { ref: menuRef, left, top } = useClampToViewport<HTMLDivElement>(viewportX, viewportY);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    const id = setTimeout(() => window.addEventListener('contextmenu', close), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    zIndex: 200,
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 6,
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    minWidth: 180,
    padding: 4,
    userSelect: 'none',
  };

  const rowStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    color: '#222',
    cursor: 'pointer',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  };

  return (
    <div ref={menuRef} style={menuStyle} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div style={{ padding: '4px 10px 6px', borderBottom: '1px solid #eee', marginBottom: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Mirror selection
        </span>
      </div>
      <div
        style={rowStyle}
        onClick={(e) => { e.stopPropagation(); onMirror('horizontal'); onClose(); }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0f4ff'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>↔</span>
        <span style={{ fontWeight: 600 }}>Mirror Horizontal</span>
      </div>
      <div
        style={rowStyle}
        onClick={(e) => { e.stopPropagation(); onMirror('vertical'); onClose(); }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0f4ff'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>↕</span>
        <span style={{ fontWeight: 600 }}>Mirror Vertical</span>
      </div>
    </div>
  );
}
