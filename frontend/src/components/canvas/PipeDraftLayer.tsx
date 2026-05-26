import { Layer, Line, Arrow, Circle } from 'react-konva';
import { ActiveTool } from '../../types';

interface PipeDraftLayerProps {
  anchorPoint: { x: number; y: number } | null;
  previewEnd: { x: number; y: number } | null;
  isActive: boolean;
  activeTool: ActiveTool;
}

const DRAFT_COLORS: Partial<Record<ActiveTool, string>> = {
  pipe: '#0066cc',
  cold_pipe: '#007bff',
  hot_pipe: '#e63329',
};

export function PipeDraftLayer({ anchorPoint, previewEnd, isActive, activeTool }: PipeDraftLayerProps) {
  if (!isActive || !anchorPoint || !previewEnd) return null;

  const color = DRAFT_COLORS[activeTool] ?? '#0066cc';
  const isColdOrHot = activeTool === 'cold_pipe' || activeTool === 'hot_pipe';

  const dx = previewEnd.x - anchorPoint.x;
  const dy = previewEnd.y - anchorPoint.y;
  const hasLength = Math.abs(dx) > 1 || Math.abs(dy) > 1;

  return (
    <Layer listening={false}>
      {hasLength && isColdOrHot ? (
        <Arrow
          points={[anchorPoint.x, anchorPoint.y, previewEnd.x, previewEnd.y]}
          pointerLength={2}
          pointerWidth={2}
          fill={color}
          stroke={color}
          strokeWidth={0.5}
          dash={[4, 3]}
          lineCap="round"
          opacity={0.7}
        />
      ) : (
        <Line
          points={[anchorPoint.x, anchorPoint.y, previewEnd.x, previewEnd.y]}
          stroke={color}
          strokeWidth={0.5}
          dash={[4, 3]}
          lineCap="round"
          opacity={0.7}
        />
      )}
      <Circle x={anchorPoint.x} y={anchorPoint.y} radius={0.5} fill={color} opacity={0.8} />
    </Layer>
  );
}
