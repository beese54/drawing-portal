import { useRef, useEffect, useMemo } from 'react';
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
  const setSelected = useCanvasStore((s) => s.setSelected);
  const moveAnnotation = useCanvasStore((s) => s.moveAnnotation);
  const updateAnnotationSize = useCanvasStore((s) => s.updateAnnotationSize);
  const updateAnnotation = useCanvasStore((s) => s.updateAnnotation);
  const resizeAnnotation = useCanvasStore((s) => s.resizeAnnotation);

  // Rendered box height always comes straight from ann.height (same as ann.maxWidth
  // drives width) so manual vertical resize is reflected immediately, with no local
  // state to fall out of sync.
  const displayHeight = ann.height > 0 ? ann.height : ann.fontSize * 1.35 * 2;

  const resizeDragRef = useRef<{ startX: number; startY: number; startMaxWidth: number; startHeight: number } | null>(null);
  const currentSizeRef = useRef({ maxWidth: ann.maxWidth, height: displayHeight });

  // Auto-grow the box when wrapped text content no longer fits (e.g. after typing
  // more text) — never shrinks, so a manual vertical resize is never overridden.
  useEffect(() => {
    if (textRef.current) {
      const h = textRef.current.height();
      if (h - displayHeight > 0.5) {
        updateAnnotationSize(ann.id, h);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ann.text, ann.maxWidth, ann.fontSize]);

  // Keep currentSizeRef in sync on every render so mouseup handlers see latest values
  currentSizeRef.current = { maxWidth: ann.maxWidth, height: displayHeight };

  return (
    <Group
      x={ann.x}
      y={ann.y}
      draggable={draggable}
      onClick={(e) => { if (e.evt.button === 0 && !selectDisabled) setSelected(ann.id); }}
      onTap={() => { if (!selectDisabled) setSelected(ann.id); }}
      onDblClick={() => onDblClick?.(ann.id, ann.x, ann.y, ann.text, ann.fontSize, ann.maxWidth, displayHeight)}
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
        x={-4.5}
        y={-4.5}
        width={ann.maxWidth + 9}
        height={displayHeight + 9}
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
          {/* Right edge — invisible hit area, resizes maxWidth */}
          <Rect
            x={ann.maxWidth + 0.5}
            y={0}
            width={8}
            height={displayHeight}
            fill="transparent"
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
              const box = stage.container().getBoundingClientRect();
              const sc = stage.scaleX();
              const startX = (e.evt.clientX - box.left - stage.x()) / sc;
              resizeDragRef.current = { startX, startY: 0, startMaxWidth: ann.maxWidth, startHeight: currentSizeRef.current.height };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current) return;
                const b = stage.container().getBoundingClientRect();
                const cx = (me.clientX - b.left - stage.x()) / stage.scaleX();
                const newW = Math.max(20, resizeDragRef.current.startMaxWidth + cx - resizeDragRef.current.startX);
                currentSizeRef.current = { ...currentSizeRef.current, maxWidth: newW };
                updateAnnotation(ann.id, ann.text, newW);
              };
              const onUp = () => {
                if (resizeDragRef.current) resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
                resizeDragRef.current = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />

          {/* Bottom edge — invisible hit area, resizes height */}
          <Rect
            x={0}
            y={displayHeight + 0.5}
            width={ann.maxWidth}
            height={8}
            fill="transparent"
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
              const box = stage.container().getBoundingClientRect();
              const sc = stage.scaleX();
              const startY = (e.evt.clientY - box.top - stage.y()) / sc;
              resizeDragRef.current = { startX: 0, startY, startMaxWidth: ann.maxWidth, startHeight: currentSizeRef.current.height };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current) return;
                const b = stage.container().getBoundingClientRect();
                const cy = (me.clientY - b.top - stage.y()) / stage.scaleX();
                const minH = ann.fontSize * 1.35;
                const newH = Math.max(minH, resizeDragRef.current.startHeight + cy - resizeDragRef.current.startY);
                currentSizeRef.current = { ...currentSizeRef.current, height: newH };
                updateAnnotationSize(ann.id, newH);
              };
              const onUp = () => {
                if (resizeDragRef.current) resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
                resizeDragRef.current = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />

          {/* Bottom-right corner — invisible hit area, resizes both */}
          <Rect
            x={ann.maxWidth + 0.5}
            y={displayHeight + 0.5}
            width={12}
            height={12}
            fill="transparent"
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
              const box = stage.container().getBoundingClientRect();
              const sc = stage.scaleX();
              const startX = (e.evt.clientX - box.left - stage.x()) / sc;
              const startY = (e.evt.clientY - box.top - stage.y()) / sc;
              resizeDragRef.current = { startX, startY, startMaxWidth: ann.maxWidth, startHeight: currentSizeRef.current.height };
              const onMove = (me: MouseEvent) => {
                if (!resizeDragRef.current) return;
                const b = stage.container().getBoundingClientRect();
                const sc2 = stage.scaleX();
                const cx = (me.clientX - b.left - stage.x()) / sc2;
                const cy = (me.clientY - b.top - stage.y()) / sc2;
                const newW = Math.max(20, resizeDragRef.current.startMaxWidth + cx - resizeDragRef.current.startX);
                const minH = ann.fontSize * 1.35;
                const newH = Math.max(minH, resizeDragRef.current.startHeight + cy - resizeDragRef.current.startY);
                currentSizeRef.current = { maxWidth: newW, height: newH };
                updateAnnotation(ann.id, ann.text, newW);
                updateAnnotationSize(ann.id, newH);
              };
              const onUp = () => {
                if (resizeDragRef.current) resizeAnnotation(ann.id, currentSizeRef.current.maxWidth, currentSizeRef.current.height);
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
