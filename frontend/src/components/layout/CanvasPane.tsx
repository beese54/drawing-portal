import { DrawingCanvas } from '../canvas/DrawingCanvas';

interface CanvasPaneProps {
  onSizeChange: (w: number, h: number) => void;
}

export function CanvasPane({ onSizeChange }: CanvasPaneProps) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
      <DrawingCanvas onSizeChange={onSizeChange} />
    </div>
  );
}
