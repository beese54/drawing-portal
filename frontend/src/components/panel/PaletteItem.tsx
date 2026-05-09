import { SymbolMeta, ActiveTool } from '../../types';
import { symbolsApi } from '../../api/client';
import { useUiStore } from '../../store/uiStore';

const PIPE_TOOL_MAP: Record<string, ActiveTool> = {
  water_pipe: 'pipe',
  cold_water_pipe: 'cold_pipe',
  hot_water_pipe: 'hot_pipe',
};

interface PaletteItemProps {
  symbol: SymbolMeta;
}

export function PaletteItem({ symbol }: PaletteItemProps) {
  const setActiveTool = useUiStore((s) => s.setActiveTool);
  const activeTool = useUiStore((s) => s.activeTool);
  const setDraggingSymbolId = useUiStore((s) => s.setDraggingSymbolId);
  const pendingSymbol = useUiStore((s) => s.pendingSymbol);
  const setPendingSymbol = useUiStore((s) => s.setPendingSymbol);

  const toolName = PIPE_TOOL_MAP[symbol.id];
  const isPipeTool = !!toolName;
  const isActiveAsPipeTool = isPipeTool && activeTool === toolName;
  const isPendingPlacement = !isPipeTool && pendingSymbol?.id === symbol.id;

  const activeColor = toolName === 'hot_pipe' ? '#e63329' : '#007bff';
  const activeBg = toolName === 'hot_pipe' ? '#ffe8e8' : '#e8f0fe';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (isPipeTool) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('symbolId', symbol.id);
    e.dataTransfer.setData('symbolName', symbol.name);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingSymbolId(symbol.id);
    // Replace browser's default ghost (the padded palette card) with a transparent
    // 1×1 pixel image so it doesn't obscure the Konva canvas preview.
    const ghost = document.createElement('img');
    ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragEnd = () => {
    setDraggingSymbolId(null);
  };

  const handleClick = () => {
    if (isPipeTool) {
      setActiveTool(isActiveAsPipeTool ? 'select' : toolName);
    } else {
      // Toggle pending placement (tap once to arm, tap again to disarm)
      if (isPendingPlacement) {
        setPendingSymbol(null);
      } else {
        setPendingSymbol({ id: symbol.id, name: symbol.name });
      }
    }
  };

  const hintSuffix = !isPipeTool
    ? isPendingPlacement
      ? ' (tap canvas to place, or tap here to cancel)'
      : ' (drag to canvas, or tap/click to select then tap canvas)'
    : toolName === 'pipe'
    ? ' (click to activate, then click two points)'
    : ' (click to activate, then click two points — H/V only)';

  return (
    <div
      draggable={!isPipeTool}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      title={symbol.name + hintSuffix}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 4px',
        borderRadius: 6,
        cursor: 'pointer',
        border: isActiveAsPipeTool ? `2px solid ${activeColor}` : isPendingPlacement ? '2px solid #f59e0b' : '1px solid #e0e0e0',
        background: isActiveAsPipeTool ? activeBg : isPendingPlacement ? '#fef3c7' : '#fff',
        userSelect: 'none',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActiveAsPipeTool && !isPendingPlacement) {
          (e.currentTarget as HTMLDivElement).style.background = '#f0f4ff';
          (e.currentTarget as HTMLDivElement).style.borderColor = '#aac4e8';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActiveAsPipeTool && !isPendingPlacement) {
          (e.currentTarget as HTMLDivElement).style.background = '#fff';
          (e.currentTarget as HTMLDivElement).style.borderColor = '#e0e0e0';
        }
      }}
    >
      <img
        src={symbolsApi.getImageUrl(symbol.id)}
        alt={symbol.name}
        width={36}
        height={36}
        draggable={false}
        style={{ display: 'block', objectFit: 'contain' }}
      />
      <span style={{ fontSize: 10, color: '#444', textAlign: 'center', lineHeight: 1.2, maxWidth: 60, wordBreak: 'break-word' }}>
        {symbol.name}
      </span>
      {isPipeTool && (
        <span style={{ fontSize: 9, color: isActiveAsPipeTool ? activeColor : '#0066cc', fontWeight: 600 }}>
          {isActiveAsPipeTool ? 'ACTIVE' : 'CLICK'}
        </span>
      )}
      {isPendingPlacement && (
        <span style={{ fontSize: 9, color: '#d97706', fontWeight: 600 }}>
          ARMED
        </span>
      )}
    </div>
  );
}
