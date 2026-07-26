import { Arrow, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { PipeType } from '../../types';
import { buildJumpSegments, PipeJump, PIPE_JUMP_RADIUS_PX } from '../../utils/pipeJumps';

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

/** [onLength, offLength] dash pattern for hot pipes — shared with the PDF exporter (there,
 *  each value is converted via mm()) so the two can't silently drift apart the way this
 *  codebase's duplicated constants have before (see e.g. NEVER_MIRROR_IMAGE_SYMBOL_IDS'
 *  history in types/index.ts). */
export const PIPE_HOT_DASH: [number, number] = [4, 2];

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
  jumps?: PipeJump[];
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
  jumps,
  onHoverEnter,
  onHoverLeave,
}: PipeElementProps) {
  const setSelected = useCanvasStore((s) => s.setSelected);
  const updatePipeEndpoints = useCanvasStore((s) => s.updatePipeEndpoints);

  const { color, strokeWidth } = getPipeDrawStyle(pipeType, isSelected, customColor);
  const dash: [number, number] | undefined = pipeType === 'hot' ? PIPE_HOT_DASH : undefined;
  const segments = buildJumpSegments(startX, startY, endX, endY, jumps ?? [], PIPE_JUMP_RADIUS_PX);

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

  const handleBodyClick = (e: Konva.KonvaEventObject<MouseEvent>) => { if (e.evt.button === 0) setSelected(id); };
  const handleBodyTap = () => setSelected(id);

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
      {/* Rendered as one segment per straight run / arc bulge (rather than a single
          Arrow) so a jump arc can always render solid regardless of the pipe's own
          dash pattern — see buildJumpSegments' isArcBulge doc for why. The zero-jump
          case (the common one) still produces exactly one segment, i.e. one plain Arrow,
          identical to the pre-jump-arc render. */}
      {segments.map((seg, i) => {
        const flatPoints = seg.points.flatMap((p) => [p.x, p.y]);
        const segDash = seg.isArcBulge ? undefined : dash;
        const shared = {
          points: flatPoints,
          stroke: color,
          strokeWidth,
          dash: segDash,
          lineCap: 'round' as const,
          lineJoin: 'round' as const,
          hitStrokeWidth: 4,
          onClick: handleBodyClick,
          onTap: handleBodyTap,
          onMouseEnter: handleBodyMouseEnter,
          onMouseLeave: handleBodyMouseLeave,
        };
        // Keyed by the segment's own physical location (not array index) — jump-arc
        // count/order can shift between renders when an unrelated pipe starts or stops
        // crossing this one, and an index key would let React silently reuse a Konva
        // node instance across two segments that just happen to land at the same
        // position, rather than the same segment. Harmless today since every prop is
        // recomputed fresh each render, but would misattribute any future per-node
        // state (e.g. a Tween) to the wrong segment.
        const segKey = `${seg.isArcBulge ? 'arc' : 'run'}:${seg.points[0].x.toFixed(3)},${seg.points[0].y.toFixed(3)}`;
        return i === segments.length - 1 ? (
          <Arrow
            key={segKey}
            {...shared}
            fill={color}
            pointerLength={PIPE_ARROW_POINTER_LENGTH}
            pointerWidth={PIPE_ARROW_POINTER_WIDTH}
          />
        ) : (
          <Line key={segKey} {...shared} />
        );
      })}
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
