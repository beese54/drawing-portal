import { Arrow, Line, Circle } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { PipeType } from '../../types';

interface PipeColors {
  normal: string;
  selected: string;
}

const PIPE_COLORS: Record<PipeType, PipeColors> = {
  generic: { normal: '#1a6faf', selected: '#0066cc' },
  cold:    { normal: '#007bff', selected: '#0055cc' },
  hot:     { normal: '#e63329', selected: '#b51f1a' },
};

interface PipeElementProps {
  id: string;
  pipeType: PipeType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isSelected: boolean;
}

export function PipeElement({
  id,
  pipeType,
  startX,
  startY,
  endX,
  endY,
  isSelected,
}: PipeElementProps) {
  const setSelected = useCanvasStore((s) => s.setSelected);
  const updatePipeEndpoints = useCanvasStore((s) => s.updatePipeEndpoints);

  const { normal, selected } = PIPE_COLORS[pipeType ?? 'generic'];
  const color = isSelected ? selected : normal;
  const strokeWidth = isSelected ? 3.5 : 2.5;

  // Skip zero-length pipes
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;

  if (pipeType === 'generic') {
    return (
      <>
        <Line
          points={[startX, startY, endX, endY]}
          stroke={color}
          strokeWidth={strokeWidth}
          lineCap="round"
          onClick={() => setSelected(id)}
          onTap={() => setSelected(id)}
          hitStrokeWidth={12}
        />
        <Circle x={startX} y={startY} radius={3} fill={color} listening={false} />
        <Circle x={endX} y={endY} radius={3} fill={color} listening={false} />
      </>
    );
  }

  // Cold/hot pipes: arrowhead at end (downstream) + draggable endpoints when selected
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const dragCursor = isHorizontal ? 'ew-resize' : 'ns-resize';

  const handleStartDragMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isHorizontal) (e.target as Konva.Node).y(startY);
    else (e.target as Konva.Node).x(startX);
  };

  const handleStartDragEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const nx = isHorizontal ? (e.target as Konva.Node).x() : startX;
    const ny = isHorizontal ? startY : (e.target as Konva.Node).y();
    updatePipeEndpoints(id, nx, ny, endX, endY);
  };

  const handleEndDragMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isHorizontal) (e.target as Konva.Node).y(endY);
    else (e.target as Konva.Node).x(endX);
  };

  const handleEndDragEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const nx = isHorizontal ? (e.target as Konva.Node).x() : endX;
    const ny = isHorizontal ? endY : (e.target as Konva.Node).y();
    updatePipeEndpoints(id, startX, startY, nx, ny);
  };

  const handleCursorEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = (e.target as Konva.Node).getStage();
    if (stage) stage.container().style.cursor = dragCursor;
  };

  const handleCursorLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = (e.target as Konva.Node).getStage();
    if (stage) stage.container().style.cursor = 'default';
  };

  return (
    <>
      <Arrow
        points={[startX, startY, endX, endY]}
        pointerLength={10}
        pointerWidth={8}
        fill={color}
        stroke={color}
        strokeWidth={strokeWidth}
        lineCap="round"
        onClick={() => setSelected(id)}
        onTap={() => setSelected(id)}
        hitStrokeWidth={12}
      />
      {/* Upstream endpoint */}
      <Circle
        x={startX}
        y={startY}
        radius={isSelected ? 5 : 3}
        fill={color}
        listening={isSelected}
        draggable={isSelected}
        onDragMove={handleStartDragMove}
        onDragEnd={handleStartDragEnd}
        onMouseEnter={handleCursorEnter}
        onMouseLeave={handleCursorLeave}
      />
      {/* Downstream endpoint */}
      <Circle
        x={endX}
        y={endY}
        radius={isSelected ? 5 : 3}
        fill={color}
        listening={isSelected}
        draggable={isSelected}
        onDragMove={handleEndDragMove}
        onDragEnd={handleEndDragEnd}
        onMouseEnter={handleCursorEnter}
        onMouseLeave={handleCursorLeave}
      />
    </>
  );
}
