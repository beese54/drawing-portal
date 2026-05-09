import { CanvasElement } from '../types';

export interface SymbolPortDef {
  role: 'upstream' | 'downstream';
  offsetX: number;
  offsetY: number;
  label?: string;
}

// ─── Port registry (offsets in px from element centre; symbol size = 48px) ───

export const SYMBOL_PORTS: Record<string, SymbolPortDef[]> = {
  gate_valve: [
    { role: 'upstream',   offsetX: -24, offsetY:   0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY:   0, label: 'Output' },
  ],
  check_valve: [
    { role: 'upstream',   offsetX: -24, offsetY:   0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY:   0, label: 'Output' },
  ],
  pump: [
    { role: 'upstream',   offsetX: -24, offsetY:   0 },
    { role: 'downstream', offsetX:  24, offsetY:   0 },
  ],
  tee_junction: [
    { role: 'upstream',   offsetX: -24, offsetY:   0, label: 'in'  },
    { role: 'downstream', offsetX:  24, offsetY:   0, label: 'out' },
    { role: 'downstream', offsetX:   0, offsetY:  24, label: 'out' },
  ],
  water_tank: [
    { role: 'upstream',   offsetX: -12, offsetY: -24, label: 'Input'  },  // top-left  (inlet)
    { role: 'downstream', offsetX:  12, offsetY:  24, label: 'Output' },  // bottom-right (outlet)
  ],
  water_heater: [
    { role: 'upstream',   offsetX: -24, offsetY:   0, label: 'Input'  },  // left side (inlet)
    { role: 'downstream', offsetX:  24, offsetY:   0, label: 'Output' },  // right side (outlet)
  ],
  elbow_bend: [
    { role: 'upstream',   offsetX: -21, offsetY:  -9, label: 'Input'  },  // left end of horizontal stub
    { role: 'downstream', offsetX:   9, offsetY:  21, label: 'Output' },  // bottom end of vertical stub
  ],
  reducer: [
    { role: 'upstream',   offsetX: -24, offsetY:   0 },
    { role: 'downstream', offsetX:  24, offsetY:   0 },
  ],
  flow_meter: [
    { role: 'upstream',   offsetX: -24, offsetY:   0 },
    { role: 'downstream', offsetX:  24, offsetY:   0 },
  ],
  water_meter: [
    { role: 'upstream',   offsetX: -24, offsetY:   0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY:   0, label: 'Output' },
  ],
  fire_hydrant: [
    { role: 'upstream',   offsetX:   0, offsetY:  24 },  // inlet bottom
    { role: 'downstream', offsetX:   0, offsetY: -24 },  // outlet top
  ],
  sump_manhole: [
    { role: 'upstream',   offsetX: -24, offsetY:   0 },
    { role: 'downstream', offsetX:   0, offsetY:  24 },
  ],
  water_fittings: [
    { role: 'upstream', offsetX: 0, offsetY: -24, label: 'Supply' },
  ],

  // ── Fixtures (terminal – upstream port only) ─────────────────────────────────
  single_tap: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  single_tap_combined: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  twin_tap: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  shower_head: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  drinking_fountain_pedestal: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  drinking_fountain_trough: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  drinking_fountain_wall: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  wash_basin: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  water_closet: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  urinal_wall: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  long_bath: [
    { role: 'upstream', offsetX: -24, offsetY: 0 },
  ],
  shower_bath: [
    { role: 'upstream', offsetX: -24, offsetY: 0 },
  ],

  // ── Inline valves (left upstream, right downstream) ──────────────────────────
  solenoid_valve: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  motorised_valve: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  globe_valve: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  pressure_reducing_valve: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  prv_with_sensor: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  jockey_pump: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  sub_meter: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  cold_water_tank: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  grease_interceptor: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  dilution_tank: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  strainer_basket: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  pressure_gauge_prv: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  sight_glass: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],
  strainer: [
    { role: 'upstream',   offsetX: -24, offsetY: 0, label: 'Input'  },
    { role: 'downstream', offsetX:  24, offsetY: 0, label: 'Output' },
  ],

  // ── Terminal valves (upstream left only) ─────────────────────────────────────
  cap_off_valve: [
    { role: 'upstream', offsetX: -24, offsetY: 0, label: 'Input' },
  ],

  // ── Branch / terminal (upstream bottom) ──────────────────────────────────────
  auto_air_relief_valve: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  pressure_gauge_cock: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  water_hammer_absorber: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  pressure_vessel_schematic: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],
  water_tank_air_vent: [
    { role: 'upstream', offsetX: 0, offsetY: 24 },
  ],

  // ── Branch / terminal (upstream top) ─────────────────────────────────────────
  vortex_inhibitor: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  tap_point_schematic: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],
  ball_float_valve: [
    { role: 'upstream', offsetX: 0, offsetY: -24 },
  ],

  // ── Branch / terminal (upstream left) ────────────────────────────────────────
  vortex_inhibitor_schematic: [
    { role: 'upstream', offsetX: -24, offsetY: 0 },
  ],

  // ── Multi-port (left upstream, right downstream, bottom downstream) ──────────
  multiport_valve: [
    { role: 'upstream',   offsetX: -24, offsetY:  0, label: 'Input'   },
    { role: 'downstream', offsetX:  24, offsetY:  0, label: 'Output'  },
    { role: 'downstream', offsetX:   0, offsetY: 24, label: 'Branch'  },
  ],
  sampling_tap: [
    { role: 'upstream',   offsetX: -24, offsetY:  0, label: 'Input'   },
    { role: 'downstream', offsetX:  24, offsetY:  0, label: 'Output'  },
    { role: 'downstream', offsetX:   0, offsetY: 24, label: 'Sample'  },
  ],

  // ── Standalone (no pipe ports) ───────────────────────────────────────────────
  level_sensor_switch:  [],
  wc_ur_isolator:       [],
  vent_cowl:            [],
  control_panel:        [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rotate an offset vector clockwise by `rotation` degrees in screen space
 * (y-axis points down).  Designed for 0 / 90 / 180 / 270.
 */
export function rotateOffset(
  offsetX: number,
  offsetY: number,
  rotation: number
): { x: number; y: number } {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: Math.round(offsetX * cos - offsetY * sin),
    y: Math.round(offsetX * sin + offsetY * cos),
  };
}

/** Absolute canvas position of a port on a given element. */
export function getPortPosition(
  element: CanvasElement,
  port: SymbolPortDef
): { x: number; y: number } {
  const sx = element.scaleX ?? 1;
  const { x: rx, y: ry } = rotateOffset(port.offsetX * sx, port.offsetY, element.rotation);
  return { x: element.x + rx, y: element.y + ry };
}

// ─── Per-instance role overrides (used for tee junction) ─────────────────────

/**
 * Returns the effective role of a port, respecting any per-instance override
 * set via element.upstreamPortIndex.
 */
export function getEffectivePortRole(
  element: CanvasElement,
  portIndex: number
): 'upstream' | 'downstream' {
  if (element.upstreamPortIndices !== undefined) {
    return element.upstreamPortIndices.includes(portIndex) ? 'upstream' : 'downstream';
  }
  if (element.upstreamPortIndex !== undefined) {
    return portIndex === element.upstreamPortIndex ? 'upstream' : 'downstream';
  }
  return SYMBOL_PORTS[element.symbolId]?.[portIndex]?.role ?? 'downstream';
}

/**
 * Returns the effective label for a port, reflecting any role override.
 */
export function getEffectivePortLabel(
  element: CanvasElement,
  portIndex: number
): string | undefined {
  const port = SYMBOL_PORTS[element.symbolId]?.[portIndex];
  if (!port?.label) return undefined;
  if (element.upstreamPortIndices !== undefined) {
    return element.upstreamPortIndices.includes(portIndex) ? 'in' : 'out';
  }
  if (element.upstreamPortIndex !== undefined) {
    return portIndex === element.upstreamPortIndex ? 'in' : 'out';
  }
  return port.label;
}

// ─── Port snap ────────────────────────────────────────────────────────────────

export interface NearestPortResult {
  elementId: string;
  portIndex: number;
  x: number;
  y: number;
  role: 'upstream' | 'downstream';
}

/**
 * Find the port closest to (cx, cy) within `threshold` px.
 * Returns null if no port is close enough.
 */
export function findNearestPort(
  cx: number,
  cy: number,
  elements: CanvasElement[],
  threshold: number
): NearestPortResult | null {
  let best: NearestPortResult | null = null;
  let bestDist = threshold;

  for (const el of elements) {
    const ports = SYMBOL_PORTS[el.symbolId] ?? [];
    for (let i = 0; i < ports.length; i++) {
      const pos = getPortPosition(el, ports[i]);
      const d = Math.sqrt((cx - pos.x) ** 2 + (cy - pos.y) ** 2);
      if (d <= bestDist) {
        bestDist = d;
        best = { elementId: el.id, portIndex: i, x: pos.x, y: pos.y, role: ports[i].role };
      }
    }
  }
  return best;
}
