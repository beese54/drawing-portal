import { useRef, useState, useEffect, useMemo } from 'react';
import { Layer, Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import type { AnnotationElement } from '../../types';

interface AnnotationNodeProps {
  ann: AnnotationElement;
  isSelected: boolean;
  isEditing: boolean;
  draggable?: boolean;
  /** When true, single-click does NOT change selection (used inside multi-select group to prevent node remount between dblclick clicks) */
  selectDisabled?: boolean;
  onDblClick?: (id: string, x: number, y: number, text: string, fontSize: number, maxWidth: number, height: number) => void;
}

export function AnnotationNode({ ann, isSelected, isEditing, draggable = true, selectDisabled = false, onDblClick }: AnnotationNodeProps) {
  const textRef = useRef<Konva.Text>(null);
  const [textHeight, setTextHeight] = useState(ann.height > 0 ? ann.height : ann.fontSize * 1.35 * 2);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const moveAnnotation = useCanvasStore((s) => s.moveAnnotation);
  const updateAnnotationSize = useCanvasStore((s) => s.updateAnnotationSize);
  const updateAnnotation = useCanvasStore((s) => s.updateAnnotation);
  const resizeAnnotation = useCanvasStore((s) => s.resizeAnnotation);

  const resizeDragRef = useRef<{ startX: number; startY: number; startMaxWidth: number; startHeight: number } | null>(null);
  const currentSizeRef = useRef({ maxWidth: ann.maxWidth, height: textHeight });

  useEffect(() => {
    if (textRef.current) {
      const h = textRef.current.height();
      setTextHeight(h);
      if (Math.abs(h - ann.height) > 0.5) {
        updateAnnotationSize(ann.id, h);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ann.text, ann.maxWidth, ann.fontSize]);

  // Keep currentSizeRef in sync on every render so mouseup handlers see latest values
  currentSizeRef.current = { maxWidth: ann.maxWidth, height: textHeight };

  return (
    <Group
      x={ann.x}
      y={ann.y}
      draggable={draggable}
      onClick={(e) => { if (e.evt.button === 0 && !selectDisabled) setSelected(ann.id); }}
      onTap={() => { if (!selectDisabled) setSelected(ann.id); }}
      onDblClick={() => onDblClick?.(ann.id, ann.x, ann.y, ann.text, ann.fontSize, ann.maxWidth, textHeight)}
      onDragEnd={(e) => {
        moveAnnotation(ann.id, e.target.x(), e.target.y());
      }}
      onMouseEnter={(e) => {
        const stage = (e.target as Konva.Node).getStage();
        if (stage) stage.container().style.cursor = 'move';
      }}
      onMouseLeave={(e) => {
        const stage = (e.target as Konva.Node).getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      <Rect
        x={-3}
        y={-3}
        width={ann.maxWidth + 6}
        height={textHeight + 6}
        fill="rgba(255,255,220,0.95)"
        stroke={isSelected ? '#0066cc' : '#bbb'}
        strokeWidth={isSelected ? 1.5 : 0.5}
        dash={isSelected ? [3, 2] : undefined}
        cornerRadius={2}
      />
      <Text
        ref={textRef}
        text={ann.text}
        fontSize={ann.fontSize}
        fill={ann.color}
        width={ann.maxWidth}
        wrap="word"
        lineHeight={1.35}
        listening={false}
      />
      {isSelected && !isEditing && (
        <Group>
          {/* Right-center handle — resizes maxWidth */}
          <Rect
            x={ann.maxWidth + 3}
            y={(textHeight + 6) / 2 - 3}
            width={6}
            height={6}
            fill="#ffffff"
            stroke="#0066cc"
            strokeWidth={1}
            cornerRadius={1}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(-1, -1, 8, 8);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            onMouseEnter={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'ew-resize';
            }}
            onMouseLeave={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'move';
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = (e.target as Konva.Node).getStage();
              if (!stage) return;
              const pos = stage.getPointerPosition();
              if (!pos) return;
              const scale = stage.scaleX();
              const offsetX = -stage.x();
              const offsetY = -stage.y();
              resizeDragRef.current = {
                startX: (pos.x + offsetX) / scale,
                startY: (pos.y + offsetY) / scale,
                startMaxWidth: ann.maxWidth,
                startHeight: currentSizeRef.current.height,
              };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current || !stage) return;
                const stageBox = stage.container().getBoundingClientRect();
                const rawX = me.clientX - stageBox.left;
                const sc = stage.scaleX();
                const offX = -stage.x();
                const cx = (rawX + offX) / sc;
                const dx = cx - resizeDragRef.current.startX;
                const newMaxWidth = Math.max(20, resizeDragRef.current.startMaxWidth + dx);
                currentSizeRef.current = { ...currentSizeRef.current, maxWidth: newMaxWidth };
                // Live preview — does NOT push history
                updateAnnotation(ann.id, ann.text, newMaxWidth);
              };
              const onUp = () => {
                if (resizeDragRef.current) {
                  // Single history entry for the entire drag
                  resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
                }
                resizeDragRef.current = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />

          {/* Bottom-center handle — resizes height */}
          <Rect
            x={(ann.maxWidth + 6) / 2 - 3}
            y={textHeight + 3}
            width={6}
            height={6}
            fill="#ffffff"
            stroke="#0066cc"
            strokeWidth={1}
            cornerRadius={1}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(-1, -1, 8, 8);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            onMouseEnter={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'ns-resize';
            }}
            onMouseLeave={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'move';
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = (e.target as Konva.Node).getStage();
              if (!stage) return;
              const pos = stage.getPointerPosition();
              if (!pos) return;
              const scale = stage.scaleX();
              const offsetY = -stage.y();
              resizeDragRef.current = {
                startX: 0,
                startY: (pos.y + offsetY) / scale,
                startMaxWidth: ann.maxWidth,
                startHeight: currentSizeRef.current.height,
              };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current || !stage) return;
                const stageBox = stage.container().getBoundingClientRect();
                const rawY = me.clientY - stageBox.top;
                const sc = stage.scaleX();
                const offY = -stage.y();
                const cy = (rawY + offY) / sc;
                const dy = cy - resizeDragRef.current.startY;
                const minHeight = ann.fontSize * 1.35;
                const newHeight = Math.max(minHeight, resizeDragRef.current.startHeight + dy);
                currentSizeRef.current = { ...currentSizeRef.current, height: newHeight };
                // Live preview — does NOT push history
                updateAnnotationSize(ann.id, newHeight);
              };
              const onUp = () => {
                if (resizeDragRef.current) {
                  // Single history entry for the entire drag
                  resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
                }
                resizeDragRef.current = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />

          {/* Bottom-right handle — resizes both */}
          <Rect
            x={ann.maxWidth + 3}
            y={textHeight + 3}
            width={6}
            height={6}
            fill="#ffffff"
            stroke="#0066cc"
            strokeWidth={1}
            cornerRadius={1}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(-1, -1, 8, 8);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            onMouseEnter={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'nwse-resize';
            }}
            onMouseLeave={(e) => {
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'move';
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = (e.target as Konva.Node).getStage();
              if (!stage) return;
              const pos = stage.getPointerPosition();
              if (!pos) return;
              const scale = stage.scaleX();
              const offsetX = -stage.x();
              const offsetY = -stage.y();
              resizeDragRef.current = {
                startX: (pos.x + offsetX) / scale,
                startY: (pos.y + offsetY) / scale,
                startMaxWidth: ann.maxWidth,
                startHeight: currentSizeRef.current.height,
              };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current || !stage) return;
                const stageBox = stage.container().getBoundingClientRect();
                const rawX = me.clientX - stageBox.left;
                const rawY = me.clientY - stageBox.top;
                const sc = stage.scaleX();
                const offX = -stage.x();
                const offY = -stage.y();
                const cx = (rawX + offX) / sc;
                const cy = (rawY + offY) / sc;
                const dx = cx - resizeDragRef.current.startX;
                const dy = cy - resizeDragRef.current.startY;
                const newMaxWidth = Math.max(20, resizeDragRef.current.startMaxWidth + dx);
                const minHeight = ann.fontSize * 1.35;
                const newHeight = Math.max(minHeight, resizeDragRef.current.startHeight + dy);
                currentSizeRef.current = { maxWidth: newMaxWidth, height: newHeight };
                // Live preview — does NOT push history; update width and height separately
                updateAnnotation(ann.id, ann.text, newMaxWidth);
                updateAnnotationSize(ann.id, newHeight);
              };
              const onUp = () => {
                if (resizeDragRef.current) {
                  // Single history entry for the entire drag
                  resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
                }
                resizeDragRef.current = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />
        </Group>
      )}
    </Group>
  );
}

interface AnnotationsLayerProps {
  onAnnotationDblClick?: (id: string, x: number, y: number, text: string, fontSize: number, maxWidth: number, height: number) => void;
  editingAnnotationId?: string;
}

export function AnnotationsLayer({ onAnnotationDblClick, editingAnnotationId }: AnnotationsLayerProps = {}) {
  const annotations = useCanvasStore((s) => s.annotations);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedAnnotationIds = useCanvasStore((s) => s.selectedAnnotationIds);
  const selectedAnnotationIdSet = useMemo(() => new Set(selectedAnnotationIds), [selectedAnnotationIds]);

  return (
    <Layer>
      {annotations
        .filter((ann) => !selectedAnnotationIdSet.has(ann.id) && ann.id !== editingAnnotationId)
        .map((ann) => (
          <AnnotationNode
            key={ann.id}
            ann={ann}
            isSelected={selectedId === ann.id}
            isEditing={editingAnnotationId === ann.id}
            onDblClick={onAnnotationDblClick}
          />
        ))}
    </Layer>
  );
}
