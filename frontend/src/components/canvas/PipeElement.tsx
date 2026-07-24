import { Arrow, Circle } from 'react-konva';
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

/** Arrowhead dimensions for cold/hot pipes (react-konva Arrow props) — shared with the PDF exporter. */
export const PIPE_ARROW_POINTER_LENGTH = 2;
export const PIPE_ARROW_POINTER_WIDTH = 2;

/** Pipe stroke color/width for a given type + selection state — single source of truth for both the Konva canvas and the PDF exporter.
 *  `customColor`, when set, always wins over the type default — even while selected. Selection is then communicated by
 *  strokeWidth alone (matches Word: your chosen color persists regardless of cursor/selection state). */
export function getPipeDrawStyle(pipeType: PipeType, isSelected: boolean, customColor?: string): { color: string; strokeWidth: number } {
  const { normal, selected } = PIPE_COLORS[pipeType ?? 'generic'];
  const color = customColor ?? (isSelected ? selected : normal);
  return { color, strokeWidth: isSelected ? 1 : 0.5 };
}

interface PipeElementProps {
  id: string;
  pipeType: PipeType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isSelected: boolean;
  isHovered?: boolean;
  customColor?: string;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
}

export function PipeElement({
  id,
  pipeType,
  startX,
  startY,
  endX,
  endY,
  isSelected,
  isHovered = false,
  customColor,
  onHoverEnter,
  onHoverLeave,
}: PipeElementProps) {
  const setSelected = useCanvasStore((s) => s.setSelected);
  const updatePipeEndpoints = useCanvasStore((s) => s.updatePipeEndpoints);

  const { color, strokeWidth } = getPipeDrawStyle(pipeType, isSelected, customColor);
  const dash: [number, number] | undefined = pipeType === 'hot' ? [4, 2] : undefined;

  // Skip zero-length pipes
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;

  // Arrowhead at end (downstream/inlet side) + draggable endpoints when selected.
  // All pipe types carry this start=outlet/end=inlet direction convention —
  // it's what port-connection validation (portConnectionStatus.ts) and export
  // flow-direction (metadataBuilder.ts) key off of.
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

  const handleBodyMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onHoverEnter?.();
    const stage = (e.target as Konva.Node).getStage();
    if (stage) stage.container().style.cursor = 'pointer';
  };

  const handleBodyMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onHoverLeave?.();
    const stage = (e.target as Konva.Node).getStage();
    if (stage) stage.container().style.cursor = 'default';
  };

  return (
    <>
      {/* Hover indicator — same treatment as a hovered symbol's port dots
          (ElementsLayer.tsx): small filled circles with a white ring, shown
          at the pipe's two endpoints. */}
      {isHovered && !isSelected && (
        <>
          <Circle x={startX} y={startY} radius={1} fill={color} stroke="#fff" strokeWidth={0.5} listening={false} />
          <Circle x={endX} y={endY} radius={1} fill={color} stroke="#fff" strokeWidth={0.5} listening={false} />
        </>
      )}
      <Arrow
        points={[startX, startY, endX, endY]}
        pointerLength={PIPE_ARROW_POINTER_LENGTH}
        pointerWidth={PIPE_ARROW_POINTER_WIDTH}
        fill={color}
        stroke={color}
        strokeWidth={strokeWidth}
        dash={dash}
        lineCap="round"
        onClick={(e) => { if (e.evt.button === 0) setSelected(id); }}
        onTap={() => setSelected(id)}
        onMouseEnter={handleBodyMouseEnter}
        onMouseLeave={handleBodyMouseLeave}
        hitStrokeWidth={4}
      />
      {/* Upstream endpoint */}
      <Circle
        x={startX}
        y={startY}
        radius={isSelected ? 1 : 0.5}
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
        radius={isSelected ? 1 : 0.5}
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
