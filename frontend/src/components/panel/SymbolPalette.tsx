import { SymbolMeta } from '../../types';
import { PaletteItem } from './PaletteItem';

interface SymbolPaletteProps {
  symbols: SymbolMeta[];
  isLoading: boolean;
  error: string | null;
}

export function SymbolPalette({ symbols, isLoading, error }: SymbolPaletteProps) {

  if (isLoading) {
    return <div style={{ fontSize: 13, color: '#888', padding: '12px 0' }}>Loading symbols...</div>;
  }

  if (error) {
    return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{error}</div>;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Symbol Palette
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
        Drag symbols onto the canvas. Click Water Pipe to draw a pipe.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        maxHeight: 340,
        overflowY: 'auto',
        padding: 2,
      }}>
        {symbols.map((sym) => (
          <PaletteItem key={sym.id} symbol={sym} />
        ))}
      </div>
    </div>
  );
}
