import { useRef, useState, useEffect, useMemo } from 'react';
import { Layer, Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import type { AnnotationElement } from '../../types';

interface AnnotationNodeProps {
  ann: AnnotationElement;
  isSelected: boolean;
  draggable?: boolean;
  onDblClick?: (id: string, x: number, y: number, text: string, fontSize: number, maxWidth: number) => void;
}

export function AnnotationNode({ ann, isSelected, draggable = true, onDblClick }: AnnotationNodeProps) {
  const textRef = useRef<Konva.Text>(null);
  const [textHeight, setTextHeight] = useState(ann.fontSize * 2);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const moveAnnotation = useCanvasStore((s) => s.moveAnnotation);

  useEffect(() => {
    if (textRef.current) {
      setTextHeight(textRef.current.height());
    }
  }, [ann.text, ann.maxWidth, ann.fontSize]);

  return (
    <Group
      x={ann.x}
      y={ann.y}
      draggable={draggable}
      onClick={() => setSelected(ann.id)}
      onTap={() => setSelected(ann.id)}
      onDblClick={() => onDblClick?.(ann.id, ann.x, ann.y, ann.text, ann.fontSize, ann.maxWidth)}
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
        fill="rgba(255,255,220,0.93)"
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
    </Group>
  );
}

interface AnnotationsLayerProps {
  onAnnotationDblClick?: (id: string, x: number, y: number, text: string, fontSize: number, maxWidth: number) => void;
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
          <AnnotationNode key={ann.id} ann={ann} isSelected={selectedId === ann.id} onDblClick={onAnnotationDblClick} />
        ))}
    </Layer>
  );
}
