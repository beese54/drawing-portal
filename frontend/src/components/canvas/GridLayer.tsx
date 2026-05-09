import React from 'react';
import { Layer, Line, Text } from 'react-konva';
import { getGridMrlValues, mrlToPixel } from '../../utils/mrlMapping';
import type { FloorLevel } from '../../types';

interface GridLayerProps {
  canvasWidth: number;
  canvasHeight: number;
  upperMrl: number;
  lowerMrl: number;
  axisWidth: number;
  floorLevels?: FloorLevel[];
}

export function GridLayer({ canvasWidth, canvasHeight, upperMrl, lowerMrl, axisWidth, floorLevels = [] }: GridLayerProps) {
  const gridValues = getGridMrlValues(upperMrl, lowerMrl);

  return (
    <Layer listening={false}>
      {/* Axis background */}
      <Line
        points={[axisWidth, 0, axisWidth, canvasHeight]}
        stroke="#ccc"
        strokeWidth={1}
      />

      {/* MRL grid lines */}
      {gridValues.map((mrl) => {
        const y = mrlToPixel(mrl, canvasHeight, upperMrl, lowerMrl);
        return (
          <React.Fragment key={mrl}>
            <Line
              points={[axisWidth, y, canvasWidth, y]}
              stroke="#e0e0e0"
              strokeWidth={1}
              dash={[6, 4]}
            />
            <Text
              x={2}
              y={y - 8}
              width={axisWidth - 6}
              text={`${mrl}m AMSL`}
              fontSize={10}
              fill="#666"
              align="right"
            />
          </React.Fragment>
        );
      })}

      {/* Bottom label (lowerMrl) */}
      <Text
        x={2}
        y={canvasHeight - 14}
        width={axisWidth - 6}
        text={`${lowerMrl}m AMSL`}
        fontSize={10}
        fill="#999"
        align="right"
      />

      {/* FFL floor level lines */}
      {floorLevels.map((floor) => {
        // Only draw if within the visible MRL range
        if (floor.fflM < lowerMrl || floor.fflM > upperMrl) return null;
        const y = mrlToPixel(floor.fflM, canvasHeight, upperMrl, lowerMrl);
        return (
          <React.Fragment key={floor.id}>
            {/* Solid line across full canvas width */}
            <Line
              points={[axisWidth, y, canvasWidth, y]}
              stroke="#1a1a1a"
              strokeWidth={1.5}
            />
            {/* Floor name label on axis */}
            <Text
              x={2}
              y={y - 16}
              width={axisWidth - 6}
              text={floor.name}
              fontSize={9}
              fontStyle="bold"
              fill="#1a1a1a"
              align="right"
            />
            {/* FFL value below floor name */}
            <Text
              x={2}
              y={y - 5}
              width={axisWidth - 6}
              text={`${floor.fflM}m AMSL`}
              fontSize={9}
              fill="#1a1a1a"
              align="right"
            />
          </React.Fragment>
        );
      })}

      {/* Canvas border */}
      <Line
        points={[axisWidth, 0, canvasWidth, 0, canvasWidth, canvasHeight, axisWidth, canvasHeight, axisWidth, 0]}
        stroke="#ccc"
        strokeWidth={1}
        closed
      />
    </Layer>
  );
}
