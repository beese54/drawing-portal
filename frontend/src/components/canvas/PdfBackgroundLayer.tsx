import { useRef, useEffect, useState } from 'react';
import { Layer, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';

interface PdfBgProps {
  dataUrl: string;
  /** Center x/y in content coords */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  locked: boolean;
  onChange: (props: { x: number; y: number; width: number; height: number }) => void;
}

export function PdfBackgroundLayer({ dataUrl, x, y, width, height, opacity, rotation, locked, onChange }: PdfBgProps) {
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [htmlImage, setHtmlImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setHtmlImage(img);
    img.src = dataUrl;
  }, [dataUrl]);

  // Attach / detach transformer when lock state changes
  useEffect(() => {
    if (!trRef.current) return;
    if (!locked && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
    } else {
      trRef.current.nodes([]);
    }
    trRef.current.getLayer()?.batchDraw();
  }, [locked, htmlImage]);

  if (!htmlImage) return null;

  return (
    <Layer listening={!locked}>
      {/* x/y is the center; offsetX/offsetY shifts the anchor so rotation is around the center */}
      <KonvaImage
        ref={imageRef}
        image={htmlImage}
        x={x}
        y={y}
        offsetX={width / 2}
        offsetY={height / 2}
        width={width}
        height={height}
        opacity={opacity}
        rotation={rotation}
        draggable={!locked}
        onDragEnd={(e) => {
          // node.x()/y() returns the new center position
          onChange({ x: e.target.x(), y: e.target.y(), width, height });
        }}
        onTransformEnd={() => {
          // offsetX/offsetY below are recentred from unrotated width/height only —
          // safe today because the Transformer has rotateEnabled={false}. If rotation
          // is ever enabled for this layer, resizing a rotated image will recentre
          // incorrectly and this needs to account for the node's current rotation.
          const node = imageRef.current!;
          const newWidth = Math.max(50, node.width() * node.scaleX());
          const newHeight = Math.max(50, node.height() * node.scaleY());
          node.setAttrs({
            width: newWidth,
            height: newHeight,
            scaleX: 1,
            scaleY: 1,
            offsetX: newWidth / 2,
            offsetY: newHeight / 2,
          });
          onChange({ x: node.x(), y: node.y(), width: newWidth, height: newHeight });
        }}
      />
      {!locked && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) return oldBox;
            return newBox;
          }}
        />
      )}
    </Layer>
  );
}
