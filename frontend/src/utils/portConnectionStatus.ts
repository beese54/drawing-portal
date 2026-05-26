import type { CanvasElement, PipeElement } from '../types';
import { getElementPorts, getPortPosition } from './symbolPorts';

/** Same threshold used by metadataBuilder for port-to-pipe matching. */
const PORT_MATCH_THRESHOLD = 2; // px

/**
 * For every element port, determine whether a pipe endpoint lies within
 * PORT_MATCH_THRESHOLD pixels of it.
 *
 * Returns Map<elementId, boolean[]> — one entry per port index.
 */
export function computePortConnectionStatus(
  elements: CanvasElement[],
  pipes: PipeElement[],
): Map<string, boolean[]> {
  const status = new Map<string, boolean[]>();

  for (const el of elements) {
    const ports = getElementPorts(el) ?? [];
    status.set(el.id, new Array(ports.length).fill(false));
  }

  // Pass 1: pipe endpoints → ports
  for (const pipe of pipes) {
    for (const [cx, cy] of [
      [pipe.startX, pipe.startY],
      [pipe.endX, pipe.endY],
    ] as [number, number][]) {
      for (const el of elements) {
        const ports = getElementPorts(el) ?? [];
        const elStatus = status.get(el.id)!;
        for (let i = 0; i < ports.length; i++) {
          const pos = getPortPosition(el, ports[i]);
          const d = Math.sqrt((cx - pos.x) ** 2 + (cy - pos.y) ** 2);
          if (d <= PORT_MATCH_THRESHOLD) {
            elStatus[i] = true;
          }
        }
      }
    }
  }

  // Pass 2: port-to-port proximity (back-to-back symbol connections, no pipe)
  for (let a = 0; a < elements.length; a++) {
    const elA = elements[a];
    const portsA = getElementPorts(elA);
    const statusA = status.get(elA.id)!;
    for (let b = a + 1; b < elements.length; b++) {
      const elB = elements[b];
      const portsB = getElementPorts(elB);
      const statusB = status.get(elB.id)!;
      for (let i = 0; i < portsA.length; i++) {
        const posA = getPortPosition(elA, portsA[i]);
        for (let j = 0; j < portsB.length; j++) {
          const posB = getPortPosition(elB, portsB[j]);
          const d = Math.sqrt((posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2);
          if (d <= PORT_MATCH_THRESHOLD) {
            statusA[i] = true;
            statusB[j] = true;
          }
        }
      }
    }
  }

  return status;
}

/**
 * Returns a flat list of unconnected port descriptors, suitable for showing
 * in a pre-export warning.
 *
 * Exclusion: the water_meter's upstream port (index 0) is the mains inlet —
 * it is never expected to have an upstream pipe connection.
 */
export function getUnconnectedPorts(
  elements: CanvasElement[],
  pipes: PipeElement[],
): Array<{ elementId: string; elementName: string; portLabel: string }> {
  const status = computePortConnectionStatus(elements, pipes);
  const result: Array<{ elementId: string; elementName: string; portLabel: string }> = [];

  for (const el of elements) {
    const ports = getElementPorts(el) ?? [];
    const elStatus = status.get(el.id) ?? [];

    for (let i = 0; i < ports.length; i++) {
      // Exception: water_meter upstream inlet — source pressure port, no pipe needed.
      if (el.symbolId === 'water_meter' && ports[i].role === 'upstream') continue;

      if (!elStatus[i]) {
        const portLabel =
          ports[i].label ?? (ports[i].role === 'upstream' ? 'Input' : 'Output');
        result.push({
          elementId: el.id,
          elementName: el.symbolName,
          portLabel,
        });
      }
    }
  }

  return result;
}
