import { getElementPorts, getPortPosition } from './symbolPorts';
import { getBackflowRule } from '../types';
import type { CanvasElement, PipeElement } from '../types';

const PORT_MATCH = 2; // px — same threshold as portConnectionStatus.ts

/**
 * Build a bidirectional element adjacency map from actual pipe connections and
 * direct port-to-port snaps. Two elements are adjacent only if a pipe endpoint
 * (or another element's port) lies within PORT_MATCH px of one of their ports.
 * Physically nearby but unconnected elements produce no edge.
 */
export function buildElementAdjacency(
  elements: CanvasElement[],
  pipes: PipeElement[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  // For each pipe, collect all elements whose ports match either endpoint,
  // then link every pair among them (handles T-splits where one endpoint
  // touches two adjacent ports).
  for (const pipe of pipes) {
    const endpointEls: [string[], string[]] = [[], []];
    for (const [ei, cx, cy] of [
      [0, pipe.startX, pipe.startY],
      [1, pipe.endX,   pipe.endY  ],
    ] as [number, number, number][]) {
      for (const el of elements) {
        for (const port of getElementPorts(el)) {
          const pos = getPortPosition(el, port);
          if (Math.hypot(pos.x - cx, pos.y - cy) <= PORT_MATCH) {
            endpointEls[ei].push(el.id);
            break;
          }
        }
      }
    }
    // Link every element at start with every element at end
    for (const a of endpointEls[0]) {
      for (const b of endpointEls[1]) {
        addEdge(a, b);
      }
    }
  }

  // Port-to-port proximity links (symbols placed directly back-to-back, no pipe drawn)
  for (let a = 0; a < elements.length; a++) {
    const portsA = getElementPorts(elements[a]);
    for (let b = a + 1; b < elements.length; b++) {
      const portsB = getElementPorts(elements[b]);
      let linked = false;
      for (const pA of portsA) {
        if (linked) break;
        const posA = getPortPosition(elements[a], pA);
        for (const pB of portsB) {
          const posB = getPortPosition(elements[b], pB);
          if (Math.hypot(posA.x - posB.x, posA.y - posB.y) <= PORT_MATCH) {
            addEdge(elements[a].id, elements[b].id);
            linked = true;
            break;
          }
        }
      }
    }
  }

  return adj;
}

/** Counts check valves / vacuum breakers reachable from startId within maxHops,
 *  via the generic element adjacency graph. */
export function countProtectionAlongBranch(
  startId: string,
  adj: Map<string, Set<string>>,
  elemById: Map<string, CanvasElement>,
  maxHops: number,
): { checkValveCount: number; hasVacuumBreaker: boolean } {
  const visited = new Set<string>([startId]);
  const queue: { id: string; hops: number }[] = [{ id: startId, hops: 0 }];
  let checkValveCount = 0;
  let hasVacuumBreaker = false;

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    const sid = elemById.get(id)?.symbolId;
    if (sid === 'check_valve') checkValveCount++;
    if (sid === 'vacuum_breaker') hasVacuumBreaker = true;
    if (hops >= maxHops) continue;
    for (const nbr of adj.get(id) ?? []) {
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push({ id: nbr, hops: hops + 1 });
      }
    }
  }
  return { checkValveCount, hasVacuumBreaker };
}

/** Finds the element directly connected at a given port position — either by a direct
 *  port-to-port snap, or via a pipe whose other end touches another element's port. */
export function findNeighborViaPort(
  portPos: { x: number; y: number },
  elements: CanvasElement[],
  pipes: PipeElement[],
  excludeId: string,
): string | null {
  const findElementAt = (x: number, y: number): string | null => {
    for (const other of elements) {
      if (other.id === excludeId) continue;
      for (const port of getElementPorts(other)) {
        const opos = getPortPosition(other, port);
        if (Math.hypot(opos.x - x, opos.y - y) <= PORT_MATCH) return other.id;
      }
    }
    return null;
  };

  const direct = findElementAt(portPos.x, portPos.y);
  if (direct) return direct;

  for (const pipe of pipes) {
    const atStart = Math.hypot(pipe.startX - portPos.x, pipe.startY - portPos.y) <= PORT_MATCH;
    const atEnd   = Math.hypot(pipe.endX   - portPos.x, pipe.endY   - portPos.y) <= PORT_MATCH;
    if (!atStart && !atEnd) continue;
    const otherX = atEnd ? pipe.startX : pipe.endX;
    const otherY = atEnd ? pipe.startY : pipe.endY;
    const viaPipe = findElementAt(otherX, otherY);
    if (viaPipe) return viaPipe;
  }
  return null;
}

export function satisfiesBackflowRule(
  rule: 'double_check_valve' | 'vb_and_check_valve',
  checkValveCount: number,
  hasVacuumBreaker: boolean,
): boolean {
  return rule === 'double_check_valve' ? checkValveCount >= 2 : hasVacuumBreaker && checkValveCount >= 1;
}

/**
 * Applies the correct protection rule for the element:
 *   double_check_valve  — needs ≥ 2 check_valves reachable (SS636 §6.4 appliances)
 *   vb_and_check_valve  — needs vacuum_breaker AND check_valve reachable (SS636 §6.5 bidet)
 *
 * Dual-supply elements (e.g. washing machine with separate Hot + Cold ports) are checked
 * per-branch — each supply line must independently satisfy the rule, so a check valve pair
 * on only one side can't suppress the warning for the other, unprotected side.
 */
export function isElementProtected(
  el: CanvasElement,
  adj: Map<string, Set<string>>,
  elemById: Map<string, CanvasElement>,
  maxHops: number,
  elements: CanvasElement[],
  pipes: PipeElement[],
): boolean {
  const rule = getBackflowRule(el);
  if (!rule) return true; // no rule — no badge

  const upstreamPorts = getElementPorts(el).filter((port) => port.role === 'upstream');
  if (upstreamPorts.length > 1) {
    return upstreamPorts.every((port) => {
      const portPos = getPortPosition(el, port);
      const neighborId = findNeighborViaPort(portPos, elements, pipes, el.id);
      if (!neighborId) return false; // branch not connected — definitely not protected
      const { checkValveCount, hasVacuumBreaker } = countProtectionAlongBranch(neighborId, adj, elemById, maxHops);
      return satisfiesBackflowRule(rule, checkValveCount, hasVacuumBreaker);
    });
  }

  const { checkValveCount, hasVacuumBreaker } = countProtectionAlongBranch(el.id, adj, elemById, maxHops);
  return satisfiesBackflowRule(rule, checkValveCount, hasVacuumBreaker);
}

/** Whether a SINGLE upstream port's own branch already has adequate protection —
 *  used to skip already-protected supply lines when auto-inserting an assembly. */
export function isBranchProtected(
  el: CanvasElement,
  portPos: { x: number; y: number },
  elements: CanvasElement[],
  pipes: PipeElement[],
  maxHops = 6,
): boolean {
  const rule = getBackflowRule(el);
  if (!rule) return true;
  const neighborId = findNeighborViaPort(portPos, elements, pipes, el.id);
  if (!neighborId) return false;
  const adj = buildElementAdjacency(elements, pipes);
  const elemById = new Map(elements.map((e) => [e.id, e]));
  const { checkValveCount, hasVacuumBreaker } = countProtectionAlongBranch(neighborId, adj, elemById, maxHops);
  return satisfiesBackflowRule(rule, checkValveCount, hasVacuumBreaker);
}
