import { SYMBOL_PORTS, getPortPosition } from './symbolPorts';
import type { PipeElement, CanvasElement } from '../types';

/**
 * Returns the fluid type at canvas point (x, y) by finding which pipe endpoint
 * the point touches, then following that pipe's upstream connection if generic.
 */
export function inferFluidAtPoint(
  pipes: PipeElement[],
  x: number,
  y: number,
  allElements: CanvasElement[],
  matchRadius = 5,
): 'cold' | 'hot' | undefined {
  for (const pipe of pipes) {
    const atStart = Math.hypot(pipe.startX - x, pipe.startY - y) < matchRadius;
    const atEnd   = Math.hypot(pipe.endX   - x, pipe.endY   - y) < matchRadius;
    if (!atStart && !atEnd) continue;
    if (pipe.pipeType === 'cold' || pipe.pipeType === 'hot') return pipe.pipeType;
    const otherX = atEnd ? pipe.startX : pipe.endX;
    const otherY = atEnd ? pipe.startY : pipe.endY;
    for (const el of allElements) {
      for (const port of SYMBOL_PORTS[el.symbolId] ?? []) {
        if (port.role !== 'downstream') continue;
        const pos = getPortPosition(el, port);
        if (Math.hypot(pos.x - otherX, pos.y - otherY) < matchRadius) {
          return el.carriesFluid;
        }
      }
    }
  }
  return undefined;
}
