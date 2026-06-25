import {
  CanvasElement,
  PipeElement,
  MrlConfig,
  DrawingMetadata,
  NodeType,
  HydraulicContext,
  ExportedElement,
  ExportedPipe,
  ExportedPort,
  ExportedTankProperties,
  SupplyMode,
  TankProperties,
  TitleBlockData,
  calcTankCapacityLitres,
  AcknowledgmentFlags,
  FIXTURE_MWELS_CATEGORY,
} from '../types';
import { pixelToMrl } from './mrlMapping';
import { distance, angleDeg } from './geometry';
import { getElementPorts, getPortPosition, getEffectivePortRole, getEffectivePortLabel } from './symbolPorts';

// ─── Symbol ID → hydraulic node type ─────────────────────────────────────────

const NODE_TYPE_MAP: Record<string, NodeType> = {
  water_tank:            'source',
  pump:                  'pressure_booster',
  gate_valve:            'isolation_valve',
  check_valve:           'check_valve',
  tee_junction:          'junction',
  water_heater:          'heat_exchanger',
  elbow_bend:            'bend',
  flow_meter:            'flow_meter',
  water_meter:           'flow_meter',
  pressure_relief_valve: 'check_valve',
  vacuum_breaker:        'check_valve',
  bidet_spray:           'water_fitting',
  bidet:                 'water_fitting',
  // Individual fixture symbols (same hydraulic role as water_fittings)
  shower_head:           'water_fitting',
  multiple_show_unit:    'water_fitting',
  shower_bath:           'water_fitting',
  wash_basin_rectangular:'water_fitting',
  sink:                  'water_fitting',
  water_closet:          'water_fitting',
  urinal_wall:           'water_fitting',
  long_bath:             'water_fitting',
  // Appliances (SS636 §6.4)
  washing_machine:       'water_fitting',
  dishwasher:            'water_fitting',
  water_dispenser:       'water_fitting',
  bib_tap_cw_cap_and_lock_schematic: 'water_fitting',
};

function nodeTypeFor(symbolId: string): NodeType {
  return NODE_TYPE_MAP[symbolId] ?? 'component';
}

/** Convert UI TankProperties to the export shape, filling missing fields with null. */
function exportTankProperties(props: TankProperties | undefined): ExportedTankProperties {
  const p = props ?? {};
  const num = (v: number | undefined): number | null => (typeof v === 'number' ? v : null);
  return {
    material:                   p.material ?? null,
    pressure_vessel_present:    typeof p.pressureVesselPresent === 'boolean' ? p.pressureVesselPresent : null,
    length_m:                   num(p.lengthM),
    width_m:                    num(p.widthM),
    height_m:                   num(p.heightM),
    floor_level_m_amsl:         num(p.floorLevelMAmsl),
    inlet_pipe_diameter_m:      num(p.inletPipeDiameterM),
    inlet_pipe_m_amsl:          num(p.inletPipeMAmsl),
    outlet_pipe_diameter_m:     num(p.outletPipeDiameterM),
    distance_outlet_to_base_m:  num(p.distanceOutletToBaseM),
    overflow_pipe_diameter_m:   num(p.overflowPipeDiameterM),
    overflow_pipe_m_amsl:       num(p.overflowPipeMAmsl),
    warning_pipe_diameter_m:    num(p.warningPipeDiameterM),
    warning_pipe_m_amsl:        num(p.warningPipeMAmsl),
    support_height_m:           num(p.supportHeightM),
    effective_capacity_l:       calcTankCapacityLitres(p),
    is_sunken_tank:             typeof p.isSunkenTank === 'boolean' ? p.isSunkenTank : null,
    occupants:                  typeof p.occupants === 'number' ? p.occupants : null,
    daily_demand_m3:            typeof p.occupants === 'number' ? Math.round(p.occupants * 141) / 1000 : null,
  };
}

// ─── Connectivity helpers ─────────────────────────────────────────────────────

/** Max px a pipe endpoint can be from a port and still count as connected. */
const PORT_MATCH_THRESHOLD = 4;

interface PortMatch {
  elementId: string;
  portIndex: number;
  role: 'upstream' | 'downstream';
}

/**
 * Finds the element port CLOSEST to (px, py) within PORT_MATCH_THRESHOLD.
 * Returns the element id, port index, and effective role, or null if none found.
 * Uses closest-wins (not first-wins) so nearby symbols don't steal each other's connections.
 */
function findPortMatch(
  px: number,
  py: number,
  elements: CanvasElement[]
): PortMatch | null {
  let best: PortMatch | null = null;
  let bestDist = PORT_MATCH_THRESHOLD;

  for (const el of elements) {
    const ports = getElementPorts(el) ?? [];
    for (let i = 0; i < ports.length; i++) {
      const pos = getPortPosition(el, ports[i]);
      const d = distance(px, py, pos.x, pos.y);
      if (d <= bestDist) {
        bestDist = d;
        best = {
          elementId: el.id,
          portIndex: i,
          role: getEffectivePortRole(el, i),
        };
      }
    }
  }
  return best;
}

// ─── Hydraulic context ────────────────────────────────────────────────────────

function buildHydraulicContext(
  exportedElements: ExportedElement[],
  exportedPipes: ExportedPipe[]
): HydraulicContext {
  const sourceEl = exportedElements.find((e) => e.node_type === 'source') ?? null;
  const pumpEls  = exportedElements.filter((e) => e.node_type === 'pressure_booster');

  const source_element_id = sourceEl?.id ?? null;
  const source_mrl_m      = sourceEl?.elevation_m ?? null;
  const pump_element_ids  = pumpEls.map((e) => e.id);

  const outletMrls: number[] = [];

  for (const pipe of exportedPipes) {
    if (pipe.start_connects_to === null) outletMrls.push(pipe.start.mrl);
    if (pipe.end_connects_to   === null) outletMrls.push(pipe.end.mrl);
  }
  for (const el of exportedElements) {
    if (el.node_type === 'outlet') outletMrls.push(el.elevation_m);
  }

  const lowest_outlet_mrl_m = outletMrls.length > 0
    ? Math.round(Math.min(...outletMrls) * 100) / 100
    : null;

  const gravity_head_available_m =
    source_mrl_m !== null && lowest_outlet_mrl_m !== null
      ? Math.round((source_mrl_m - lowest_outlet_mrl_m) * 100) / 100
      : null;

  const hasPump   = pump_element_ids.length > 0;
  const hasSource = source_element_id !== null;

  let flow_mode: HydraulicContext['flow_mode'];
  if (!hasSource && !hasPump) {
    flow_mode = 'undetermined';
  } else if (hasPump) {
    flow_mode = 'pump_assisted';
  } else {
    flow_mode = 'gravity';
  }

  let gravity_head_sufficient: boolean | null = null;
  if (gravity_head_available_m !== null) {
    gravity_head_sufficient = hasPump ? true : gravity_head_available_m > 0;
  } else if (hasPump) {
    gravity_head_sufficient = true;
  }

  let note: string;
  if (flow_mode === 'undetermined') {
    note = 'No water tank or pump detected; flow mode cannot be determined.';
  } else if (flow_mode === 'pump_assisted') {
    const headStr = gravity_head_available_m !== null
      ? ` Gravity head from source: ${gravity_head_available_m} m.`
      : '';
    note = `Pump-assisted system (${pump_element_ids.length} pump(s) detected).${headStr} Pump provides pressure regardless of gravity head.`;
  } else {
    if (gravity_head_available_m !== null) {
      const sufficient = gravity_head_available_m > 0;
      note = sufficient
        ? `Gravity-fed system. Gravity head = ${gravity_head_available_m} m — sufficient to reach outlets.`
        : `Gravity-fed system. Gravity head = ${gravity_head_available_m} m — INSUFFICIENT; outlets are at or above source. Consider adding a pump.`;
    } else {
      note = 'Gravity-fed system. Insufficient data to calculate gravity head.';
    }
  }

  return {
    flow_mode,
    source_element_id,
    source_mrl_m,
    pump_element_ids,
    lowest_outlet_mrl_m,
    gravity_head_available_m,
    gravity_head_sufficient,
    note,
  };
}

// ─── Supply mode classification ───────────────────────────────────────────────

/**
 * BFS from each water_tank outward along the connectivity graph.
 * Pipes/elements upstream of the tank's inlet  → 'direct_supply'  (mains/direct feed)
 * Pipes/elements downstream of the tank's outlet → 'indirect_supply' (stored water distribution)
 * Water tank itself and unconnected nodes       → null
 */
function buildSupplyModes(
  exportedElements: ExportedElement[],
  exportedPipes:    ExportedPipe[]
): {
  elementSupply: Map<string, SupplyMode>;
  pipeSupply:    Map<string, SupplyMode>;
} {
  const elementSupply = new Map<string, SupplyMode>(exportedElements.map((el) => [el.id, null]));
  const pipeSupply    = new Map<string, SupplyMode>(exportedPipes.map((p)  => [p.id,   null]));

  const waterMeters = exportedElements.filter((el) => el.symbol_id === 'water_tank');
  if (waterMeters.length === 0) {
    // No tank present — entire system is direct supply
    for (const el of exportedElements) elementSupply.set(el.id, 'direct_supply');
    for (const p  of exportedPipes)    pipeSupply.set(p.id,   'direct_supply');
    return { elementSupply, pipeSupply };
  }

  // Build adjacency: element ↔ pipes
  const elToPipes   = new Map<string, Set<string>>();
  const pipeToEls   = new Map<string, Set<string>>();

  for (const el of exportedElements) elToPipes.set(el.id, new Set());
  for (const p of exportedPipes) {
    const connectedEls = new Set<string>();
    if (p.start_connects_to) { connectedEls.add(p.start_connects_to); elToPipes.get(p.start_connects_to)?.add(p.id); }
    if (p.end_connects_to)   { connectedEls.add(p.end_connects_to);   elToPipes.get(p.end_connects_to)?.add(p.id);   }
    pipeToEls.set(p.id, connectedEls);
  }

  // Use ALL meter IDs as traversal barriers so BFS never crosses through a meter
  const meterIds = new Set(waterMeters.map((m) => m.id)); // tanks act as traversal barriers

  for (const meter of waterMeters) {
    for (const pipeId of elToPipes.get(meter.id) ?? []) {
      const pipe = exportedPipes.find((p) => p.id === pipeId);
      if (!pipe) continue;

      // Determine which side of the meter this pipe is on
      let mode: SupplyMode = null;
      if (pipe.flow_to_element_id   === meter.id) mode = 'direct_supply';
      if (pipe.flow_from_element_id === meter.id) mode = 'indirect_supply';
      if (!mode) continue;

      // BFS: spread mode to all reachable elements/pipes without crossing the meter
      const visitedEls   = new Set<string>(meterIds);
      const visitedPipes = new Set<string>();
      const queue: string[] = [pipeId];

      while (queue.length > 0) {
        const currPipeId = queue.shift()!;
        if (visitedPipes.has(currPipeId)) continue;
        visitedPipes.add(currPipeId);
        pipeSupply.set(currPipeId, mode);

        for (const elId of pipeToEls.get(currPipeId) ?? []) {
          if (visitedEls.has(elId)) continue;
          visitedEls.add(elId);
          elementSupply.set(elId, mode);
          for (const nextPipeId of elToPipes.get(elId) ?? []) {
            if (!visitedPipes.has(nextPipeId)) queue.push(nextPipeId);
          }
        }
      }
    }
  }

  return { elementSupply, pipeSupply };
}

// ─── Main export ──────────────────────────────────────────────────────────────

const DEFAULT_ACKS: AcknowledgmentFlags = {
  materialsAcknowledged: false,
  pumpHeadAcknowledged: false,
  pumpDischargeMaterialAcknowledged: false,
  heaterTypeAcknowledged: false,
  applianceCheckValveAcknowledged: false,
  bidetVacuumBreakerAcknowledged: false,
  tankPositionAcknowledged: false,
};

export function buildMetadata(
  elements: CanvasElement[],
  pipes: PipeElement[],
  mrlConfig: MrlConfig,
  canvasWidth: number,
  canvasHeight: number,
  sourcePressureBar: number | null = null,
  acks: AcknowledgmentFlags = DEFAULT_ACKS,
  titleBlock: TitleBlockData = {} as TitleBlockData,
): DrawingMetadata {
  const { upperMrl, lowerMrl } = mrlConfig;

  // ── Pass 1: build pipes with full port-level connectivity ──────────────────
  const exportedPipes: ExportedPipe[] = pipes.map((p) => {
    const len        = distance(p.startX, p.startY, p.endX, p.endY);
    const startMatch = findPortMatch(p.startX, p.startY, elements);
    const endMatch   = findPortMatch(p.endX,   p.endY,   elements);

    // Determine flow direction: flow enters from a downstream (outlet) port
    // and exits through an upstream (inlet) port.
    let flow_from_element_id: string | null = null;
    let flow_from_port_index: number | null = null;
    let flow_to_element_id:   string | null = null;
    let flow_to_port_index:   number | null = null;

    if (startMatch?.role === 'downstream') {
      flow_from_element_id = startMatch.elementId;
      flow_from_port_index = startMatch.portIndex;
    }
    if (endMatch?.role === 'downstream') {
      flow_from_element_id = endMatch.elementId;
      flow_from_port_index = endMatch.portIndex;
    }
    if (startMatch?.role === 'upstream') {
      flow_to_element_id = startMatch.elementId;
      flow_to_port_index = startMatch.portIndex;
    }
    if (endMatch?.role === 'upstream') {
      flow_to_element_id = endMatch.elementId;
      flow_to_port_index = endMatch.portIndex;
    }

    const startMrl = Math.round(pixelToMrl(p.startY, canvasHeight, upperMrl, lowerMrl) * 100) / 100;
    const endMrl   = Math.round(pixelToMrl(p.endY,   canvasHeight, upperMrl, lowerMrl) * 100) / 100;

    return {
      id: p.id,
      type: 'water_pipe' as const,
      pipe_type: p.pipeType,
      start: { canvas_x: Math.round(p.startX * 100) / 100, canvas_y: Math.round(p.startY * 100) / 100, mrl: startMrl },
      end:   { canvas_x: Math.round(p.endX   * 100) / 100, canvas_y: Math.round(p.endY   * 100) / 100, mrl: endMrl   },
      supply_mode: null as SupplyMode, // filled in Pass 4
      start_connects_to: startMatch?.elementId    ?? null,
      start_port_index:  startMatch?.portIndex    ?? null,
      start_port_role:   startMatch?.role         ?? null,
      end_connects_to:   endMatch?.elementId      ?? null,
      end_port_index:    endMatch?.portIndex      ?? null,
      end_port_role:     endMatch?.role           ?? null,
      flow_from_element_id,
      flow_from_port_index,
      flow_to_element_id,
      flow_to_port_index,
      length_px:    Math.round(len * 100) / 100,
      rotation_deg: Math.round(angleDeg(p.startX, p.startY, p.endX, p.endY) * 100) / 100,
    };
  });

  // Build a lookup: (elementId, portIndex) → pipe id, for Pass 2.5
  const portToPipeId = new Map<string, string>();
  for (const ep of exportedPipes) {
    if (ep.start_connects_to !== null && ep.start_port_index !== null) {
      portToPipeId.set(`${ep.start_connects_to}:${ep.start_port_index}`, ep.id);
    }
    if (ep.end_connects_to !== null && ep.end_port_index !== null) {
      portToPipeId.set(`${ep.end_connects_to}:${ep.end_port_index}`, ep.id);
    }
  }

  // ── Pass 2: build elements with per-port detail ────────────────────────────
  const exportedElements: ExportedElement[] = elements.map((el) => {
    const portDefs = getElementPorts(el) ?? [];

    const ports: ExportedPort[] = portDefs.map((portDef, i) => {
      const pos   = getPortPosition(el, portDef);
      const role  = getEffectivePortRole(el, i);
      const label = getEffectivePortLabel(el, i) ?? portDef.label ?? null;

      const connectedPipeId = portToPipeId.get(`${el.id}:${i}`) ?? null;

      // connects_to fields filled in Pass 2.5 below
      return {
        index: i,
        role,
        label,
        position: {
          canvas_x: Math.round(pos.x * 100) / 100,
          canvas_y: Math.round(pos.y * 100) / 100,
        },
        mrl: {
          value: Math.round(pixelToMrl(pos.y, canvasHeight, upperMrl, lowerMrl) * 100) / 100,
          unit: 'm AMSL' as const,
        },
        connected_pipe_id: connectedPipeId,
        connects_to_element_id: null,
        connects_to_port_index: null,
      };
    });

    const connectedPipeIds = exportedPipes
      .filter((p) => p.start_connects_to === el.id || p.end_connects_to === el.id)
      .map((p) => p.id);

    const elMrl = Math.round(pixelToMrl(el.y, canvasHeight, upperMrl, lowerMrl) * 100) / 100;

    return {
      id: el.id,
      type: 'symbol' as const,
      symbol_id: el.symbolId,
      symbol_name: el.symbolName,
      node_type: nodeTypeFor(el.symbolId),
      position: { canvas_x: Math.round(el.x * 100) / 100, canvas_y: Math.round(el.y * 100) / 100 },
      width: el.width,
      height: el.height,
      elevation_m: elMrl,
      supply_mode: null as SupplyMode, // filled in Pass 4
      rotation_deg: el.rotation,
      scale_x: el.scaleX ?? 1,
      ports,
      connected_pipe_ids: connectedPipeIds,
      ...(el.symbolId in FIXTURE_MWELS_CATEGORY
        ? {
            fitting_type: FIXTURE_MWELS_CATEGORY[el.symbolId] ?? null,
            efficiency_rating: el.efficiencyRating ?? null,
          }
        : {}),
      ...(el.symbolId === 'water_tank'
        ? { tank_properties: exportTankProperties(el.tankProperties) }
        : {}),
      ...(el.symbolId === 'long_bath'
        ? { long_bath_capacity_l: el.longBathCapacityL ?? null }
        : {}),
    };
  });

  // ── Pass 2.5: enrich each port with connects_to_element_id / connects_to_port_index ──
  // Build a map from pipeId → ExportedPipe for O(1) lookup
  const pipeById = new Map<string, ExportedPipe>();
  for (const ep of exportedPipes) pipeById.set(ep.id, ep);

  for (const el of exportedElements) {
    for (const port of el.ports) {
      if (!port.connected_pipe_id) continue;
      const pipe = pipeById.get(port.connected_pipe_id);
      if (!pipe) continue;

      // The current element is at one end; the other end is the adjacent element
      let otherElementId: string | null;
      let otherPortIndex: number | null;

      if (pipe.start_connects_to === el.id && pipe.start_port_index === port.index) {
        otherElementId = pipe.end_connects_to;
        otherPortIndex = pipe.end_port_index;
      } else {
        otherElementId = pipe.start_connects_to;
        otherPortIndex = pipe.start_port_index;
      }

      port.connects_to_element_id = otherElementId;
      port.connects_to_port_index = otherPortIndex;
    }
  }

  // ── Pass 2.6: resolve direct port-to-port connections (no pipe between them) ─
  // When a user snaps tee → elbow (or tee → tee) without drawing a pipe between
  // them, the ports are close but may not be pixel-perfect due to floating point.
  // Use the same PORT_MATCH_THRESHOLD distance scan as findPortMatch instead of
  // exact coordinate matching, so a 2-3px gap doesn't break the connection.
  {
    for (const el of exportedElements) {
      for (const port of el.ports) {
        if (port.connected_pipe_id || port.connects_to_element_id) continue;

        let bestDist = PORT_MATCH_THRESHOLD;
        let bestMatch: { elementId: string; portIndex: number } | null = null;

        for (const otherEl of exportedElements) {
          if (otherEl.id === el.id) continue;
          for (const otherPort of otherEl.ports) {
            const dx = port.position.canvas_x - otherPort.position.canvas_x;
            const dy = port.position.canvas_y - otherPort.position.canvas_y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) {
              bestDist = d;
              bestMatch = { elementId: otherEl.id, portIndex: otherPort.index };
            }
          }
        }

        if (bestMatch) {
          port.connects_to_element_id = bestMatch.elementId;
          port.connects_to_port_index = bestMatch.portIndex;
        }
      }
    }
  }

  // ── Pass 2.7: derive pipe_type for tee junctions and elbow bends ──────────
  // Trace backwards from the upstream port through the pipe/element graph to
  // find the first cold/hot pipe type.  Handles both pipe connections and
  // direct port-to-port connections (populated by Pass 2.6).
  {
    const JUNCTION_IDS = new Set(['tee_junction', 'elbow_bend']);
    const elCarriesFluid = new Map(elements.map((el) => [el.id, el.carriesFluid]));

    // Unified BFS that follows both pipes and direct element connections.
    function traceFluid(
      startPipeId: string | null,
      startElementId: string | null,
      visitedPipes: Set<string>,
      visitedEls: Set<string>,
    ): 'cold' | 'hot' | null {
      if (startPipeId) {
        if (visitedPipes.has(startPipeId)) return null;
        visitedPipes.add(startPipeId);
        const pipe = pipeById.get(startPipeId);
        if (!pipe) return null;
        if (pipe.pipe_type === 'cold' || pipe.pipe_type === 'hot') return pipe.pipe_type;
        // Generic pipe — traverse all connected elements
        for (const elId of [pipe.flow_from_element_id, pipe.start_connects_to, pipe.end_connects_to]) {
          if (!elId) continue;
          const r = traceFluid(null, elId, visitedPipes, visitedEls);
          if (r) return r;
        }
        return null;
      }

      if (startElementId) {
        if (visitedEls.has(startElementId)) return null;
        visitedEls.add(startElementId);
        const fluid = elCarriesFluid.get(startElementId);
        if (fluid === 'cold' || fluid === 'hot') return fluid;
        const expEl = exportedElements.find((e) => e.id === startElementId);
        if (!expEl) return null;
        for (const port of expEl.ports) {
          if (port.connected_pipe_id) {
            const r = traceFluid(port.connected_pipe_id, null, visitedPipes, visitedEls);
            if (r) return r;
          }
          if (port.connects_to_element_id) {
            const r = traceFluid(null, port.connects_to_element_id, visitedPipes, visitedEls);
            if (r) return r;
          }
        }
        return null;
      }

      return null;
    }

    for (const expEl of exportedElements) {
      if (!JUNCTION_IDS.has(expEl.symbol_id)) continue;
      // Fast path: stored carriesFluid on the canvas element
      const stored = elCarriesFluid.get(expEl.id);
      if (stored === 'cold' || stored === 'hot') {
        expEl.pipe_type = stored;
        continue;
      }
      const upstreamPort = expEl.ports.find((p) => p.role === 'upstream');
      if (!upstreamPort) {
        expEl.pipe_type = null;
        continue;
      }
      const visitedPipes = new Set<string>();
      const visitedEls   = new Set<string>([expEl.id]); // exclude self to avoid cycles
      if (upstreamPort.connected_pipe_id) {
        expEl.pipe_type = traceFluid(upstreamPort.connected_pipe_id, null, visitedPipes, visitedEls);
      } else if (upstreamPort.connects_to_element_id) {
        expEl.pipe_type = traceFluid(null, upstreamPort.connects_to_element_id, visitedPipes, visitedEls);
      } else {
        expEl.pipe_type = null;
      }
    }
  }

  // ── Pass 3: hydraulic context ──────────────────────────────────────────────
  const hydraulic_context = buildHydraulicContext(exportedElements, exportedPipes);

  // ── Pass 4: supply mode (direct / indirect relative to water meter) ────────
  const { elementSupply, pipeSupply } = buildSupplyModes(exportedElements, exportedPipes);
  for (const el   of exportedElements) el.supply_mode   = elementSupply.get(el.id) ?? null;
  for (const pipe of exportedPipes)    pipe.supply_mode = pipeSupply.get(pipe.id)   ?? null;

  const totalPipeLength = exportedPipes.reduce((sum, p) => sum + p.length_px, 0);

  return {
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    title_block: titleBlock,
    mrl_config: {
      upper_mrl: upperMrl,
      lower_mrl: lowerMrl,
      unit: 'm AMSL' ,
      range: upperMrl - lowerMrl,
    },
    canvas: { width_px: canvasWidth, height_px: canvasHeight },
    source_pressure_bar: sourcePressureBar,
    materials_acknowledged: acks.materialsAcknowledged,
    pump_head_acknowledged: acks.pumpHeadAcknowledged,
    pump_discharge_material_acknowledged: acks.pumpDischargeMaterialAcknowledged,
    heater_type_acknowledged: acks.heaterTypeAcknowledged,
    appliance_check_valve_acknowledged: acks.applianceCheckValveAcknowledged,
    bidet_vacuum_breaker_acknowledged: acks.bidetVacuumBreakerAcknowledged,
    tank_position_acknowledged: acks.tankPositionAcknowledged,
    elements: exportedElements,
    pipes: exportedPipes,
    hydraulic_context,
    summary: {
      total_elements: exportedElements.length,
      total_pipes: exportedPipes.length,
      total_pipe_length_px: Math.round(totalPipeLength * 100) / 100,
    },
  };
}
