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
  floorLevelOpacity?: number;
}

export function GridLayer({ canvasWidth, canvasHeight, upperMrl, lowerMrl, axisWidth, floorLevels = [], floorLevelOpacity = 1 }: GridLayerProps) {
  const gridValues = getGridMrlValues(upperMrl, lowerMrl);

  return (
    <Layer listening={false}>
      {/* Axis background */}
      <Line
        points={[axisWidth, 0, axisWidth, canvasHeight]}
        stroke="#ccc"
        strokeWidth={1}
      />

      {/* Y-axis header — m AMSL label at the top */}
      <Text
        x={2}
        y={4}
        width={axisWidth - 6}
        text="m AMSL"
        fontSize={9}
        fill="#999"
        align="right"
        fontStyle="italic"
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
              text={`${mrl.toFixed(1)}m`}
              fontSize={10}
              fill="#666"
              align="right"
            />
          </React.Fragment>
        );
      })}

      {/* Bottom label (lowerMrl) — only when lowerMrl is not already a grid line */}
      {!gridValues.includes(lowerMrl) && (
        <Text
          x={2}
          y={canvasHeight - 14}
          width={axisWidth - 6}
          text={`${lowerMrl.toFixed(1)}m`}
          fontSize={10}
          fill="#999"
          align="right"
        />
      )}

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
              opacity={floorLevelOpacity}
            />
            {/* Floor name + elevation — placed inside the canvas, above the floor line */}
            <Text
              x={axisWidth + 4}
              y={y - 22}
              text={floor.name}
              fontSize={9}
              fontStyle="bold"
              fill="#1a1a1a"
              opacity={floorLevelOpacity}
              listening={false}
            />
            <Text
              x={axisWidth + 4}
              y={y - 12}
              text={`${floor.fflM.toFixed(1)}m AMSL`}
              fontSize={8}
              fill="#555"
              opacity={floorLevelOpacity}
              listening={false}
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
