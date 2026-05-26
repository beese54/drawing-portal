import { useState } from 'react';
import { SymbolMeta } from '../../types';
import { PaletteItem } from './PaletteItem';

interface SymbolPaletteProps {
  symbols: SymbolMeta[];
  isLoading: boolean;
  error: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  water_supply: 'Water Supply',
  backflow_prevention: 'Valves & Protection',
  pumps: 'Pumps & Boosters',
  tanks: 'Tanks & Heating',
  sanitary: 'Sanitary Fittings',
  default: 'General',
  custom: 'Custom',
};

const CATEGORY_ORDER = ['water_supply', 'backflow_prevention', 'pumps', 'tanks', 'sanitary', 'default', 'custom'];

export function SymbolPalette({ symbols, isLoading, error }: SymbolPaletteProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return <div style={{ fontSize: 13, color: '#888', padding: '12px 0' }}>Loading symbols...</div>;
  }

  if (error) {
    return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{error}</div>;
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : null;

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
    padding: 2,
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Symbol Palette
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
        Drag symbols onto the canvas. Click Water Pipe to draw a pipe.
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search symbols…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '5px 28px 5px 8px',
            fontSize: 12,
            border: '1px solid #ddd',
            borderRadius: 5,
            outline: 'none',
            color: '#333',
            background: '#fff',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: '#999',
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Search results — flat list */}
      {filtered ? (
        filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '16px 0' }}>
            No symbols match "{query}"
          </div>
        ) : (
          <div style={{ ...gridStyle, maxHeight: 340, overflowY: 'auto' }}>
            {filtered.map((sym) => (
              <PaletteItem key={sym.id} symbol={sym} />
            ))}
          </div>
        )
      ) : (
        /* Grouped view */
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {CATEGORY_ORDER.map((cat) => {
            const group = symbols.filter((s) => (s.category ?? 'default') === cat);
            if (group.length === 0) return null;
            const isCollapsed = !!collapsed[cat];
            const label = CATEGORY_LABELS[cat] ?? cat;
            return (
              <div key={cat} style={{ marginBottom: 6 }}>
                <button
                  onClick={() => toggleCategory(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    background: '#f0f4f8',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#444',
                    textAlign: 'left',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#888', lineHeight: 1 }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>{group.length}</span>
                </button>
                {!isCollapsed && (
                  <div style={{ ...gridStyle, marginTop: 4 }}>
                    {group.map((sym) => (
                      <PaletteItem key={sym.id} symbol={sym} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
