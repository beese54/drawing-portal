export type ActiveTool = 'select' | 'pipe' | 'cold_pipe' | 'hot_pipe';
export type PipeType = 'generic' | 'cold' | 'hot';

export const WATER_FITTING_TYPES = [
  { id: 'shower_tap',            code: 'ST',  label: 'Shower Tap'            },
  { id: 'basin_tap',             code: 'BT',  label: 'Basin Tap'             },
  { id: 'sink_tap',              code: 'ST',  label: 'Sink Tap'              },
  { id: 'urinal_flush',          code: 'UR',  label: 'Urinal Flush'          },
  { id: 'water_closet',          code: 'WC',  label: 'Water Closet'          },
  { id: 'dual_flushing_cistern', code: 'DFC', label: 'Dual Flushing Cistern' },
] as const;

export type WaterFittingTypeId = (typeof WATER_FITTING_TYPES)[number]['id'];

export const ROTATABLE_SYMBOL_IDS = [
  'check_valve', 'gate_valve', 'tee_junction', 'pump', 'elbow_bend', 'water_tank', 'water_heater', 'water_meter', 'water_fittings',
  // new inline valves & equipment
  'solenoid_valve', 'motorised_valve', 'globe_valve', 'pressure_reducing_valve', 'prv_with_sensor',
  'jockey_pump', 'sub_meter', 'cold_water_tank', 'grease_interceptor', 'dilution_tank',
  'strainer_basket', 'pressure_gauge_prv', 'sight_glass', 'strainer',
  'cap_off_valve', 'multiport_valve', 'sampling_tap',
] as const;
export type RotatableSymbolId = (typeof ROTATABLE_SYMBOL_IDS)[number];

/** Full 360° clockwise rotation (0/90/180/270). */
export const CLOCKWISE_SYMBOL_IDS = [
  'tee_junction', 'elbow_bend', 'check_valve', 'gate_valve', 'water_fittings',
  // new inline valves & equipment
  'solenoid_valve', 'motorised_valve', 'globe_valve', 'pressure_reducing_valve', 'prv_with_sensor',
  'jockey_pump', 'sub_meter', 'cold_water_tank', 'grease_interceptor', 'dilution_tank',
  'strainer_basket', 'pressure_gauge_prv', 'sight_glass', 'strainer',
  'cap_off_valve', 'multiport_valve', 'sampling_tap',
] as const;
/** Left-to-right / right-to-left flip only (0° or 180°). */
export const FLIP_ONLY_SYMBOL_IDS = ['pump', 'water_tank', 'water_heater', 'water_meter'] as const;

export interface MrlConfig {
  upperMrl: number;
  lowerMrl: number;
}

export interface FloorLevel {
  id: string;
  name: string;   // e.g. "1ST STOREY", "2ND STOREY"
  fflM: number;   // Finished Floor Level in metres AMSL
}

export const MRL_LOWER_HARD_MIN = 0;
export const MRL_UPPER_HARD_MAX = 300;

export interface CanvasElement {
  id: string;
  symbolId: string;
  symbolName: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  /** Horizontal scale: 1 = normal, -1 = mirrored (used for water_tank Left←Right). */
  scaleX?: number;
  /** Fitting sub-type for water_fittings elements (stores WaterFittingTypeId). */
  fittingType?: string;
  /** Water efficiency rating (WELS ticks) for water_fittings elements. */
  efficiencyRating?: 2 | 3;
  /** Single upstream port index — backward-compat for 1-inlet symbols. */
  upstreamPortIndex?: number;
  /** Multiple upstream port indices — used for tee in 2-inlet mode. */
  upstreamPortIndices?: number[];
  /** Tank-specific properties — only present on water_tank elements. */
  tankProperties?: TankProperties;
  /** Capacity in litres — only present on long_bath elements. */
  longBathCapacityL?: number;
  /**
   * Fluid type carried by this element (cold or hot).
   * Set automatically when the element is snapped to a pipe at placement time
   * and propagated through generic pipes to upstream elements.
   * Used to tint tee junctions and elbow bends to match their input pipe colour.
   */
  carriesFluid?: 'cold' | 'hot';
}

export type PipeMaterial = string;
export type NominalSizeMm = number;

// ─── Water Tank properties ────────────────────────────────────────────────────

export type TankMaterial = string; // 'FRP' | 'GRP' | 'SS_316' | 'RC' | 'Other' | custom

export const TANK_MATERIAL_OPTIONS = [
  { value: 'FRP',    label: 'FRP'                  },
  { value: 'GRP',    label: 'GRP'                  },
  { value: 'SS_316', label: 'Stainless Steel 316'  },
  { value: 'RC',     label: 'Reinforced Concrete'  },
  { value: 'Other',  label: 'Other'                },
] as const;

/**
 * Editable properties for a Water Tank element.
 * Mirrors the PE WSI Tank Checker fields. All elevations in metres AMSL,
 * all dimensions/diameters in metres. Effective capacity is derived
 * from length × width × height at runtime, not stored here.
 */
export interface TankProperties {
  // Quick-panel
  material?: TankMaterial;
  pressureVesselPresent?: boolean;
  isSunkenTank?: boolean;

  // Dimensions (m) — drive auto-calculated capacity
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  floorLevelMAmsl?: number;

  // Inlet
  inletPipeDiameterM?: number;
  inletPipeMAmsl?: number;

  // Outlet
  outletPipeDiameterM?: number;
  distanceOutletToBaseM?: number;

  // Overflow
  overflowPipeDiameterM?: number;
  overflowPipeMAmsl?: number;

  // Warning
  warningPipeDiameterM?: number;
  warningPipeMAmsl?: number;

  // Supports
  supportHeightM?: number;
}

/**
 * Compute the maximum water level AMSL from inlet/overflow geometry.
 * Formula (SS 245): Inlet Pipe AMSL − Overflow Pipe Diameter − 0.075
 */
export function calcWaterLevelAmsl(props: TankProperties | undefined): number | null {
  if (!props) return null;
  const { inletPipeMAmsl, overflowPipeDiameterM } = props;
  if (typeof inletPipeMAmsl !== 'number' || typeof overflowPipeDiameterM !== 'number') return null;
  return Math.round((inletPipeMAmsl - overflowPipeDiameterM - 0.075) * 10000) / 10000;
}

/** Compute tank effective capacity in litres from length × width × height (metres). */
export function calcTankCapacityLitres(props: TankProperties | undefined): number | null {
  if (!props) return null;
  const { lengthM, widthM, heightM } = props;
  if (
    typeof lengthM !== 'number' || lengthM <= 0 ||
    typeof widthM  !== 'number' || widthM  <= 0 ||
    typeof heightM !== 'number' || heightM <= 0
  ) {
    return null;
  }
  return Math.round(lengthM * widthM * heightM * 1000 * 100) / 100; // L
}

export interface PipeElement {
  id: string;
  pipeType: PipeType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** Real-world pipe length in metres (user-entered). */
  lengthM?: number;
  /** Nominal pipe size in mm. */
  nominalSizeMm?: NominalSizeMm;
  /** Pipe material, e.g. copper, ss, PVC, HDPE. */
  material?: PipeMaterial;
}

export interface SymbolMeta {
  id: string;
  name: string;
  category: 'default' | 'custom' | 'fixtures' | 'valves' | 'equipment';
  filename: string;
  url: string;
  created_at: string;
}

// ─── Metadata export types ────────────────────────────────────────────────────

/**
 * Hydraulic role of a placed symbol in the flow network.
 * Used by Stage 2 AI agents to reason about the system without
 * needing to hard-code symbol IDs.
 */
export type NodeType =
  | 'source'            // water_tank — origin of supply
  | 'pressure_booster'  // pump — increases pressure / lifts water
  | 'isolation_valve'   // gate_valve — can shut off flow
  | 'check_valve'       // check_valve — prevents backflow
  | 'junction'          // tee_junction — splits or joins flow
  | 'heat_exchanger'    // water_heater
  | 'bend'              // elbow_bend
  | 'reducer'           // reducer — diameter change
  | 'flow_meter'        // flow_meter, water_meter
  | 'water_fitting'    // water_fittings — terminal fixture (tap, WC, etc.)
  | 'outlet'           // fire_hydrant, sump_manhole — terminal points
  | 'component';       // anything else / custom symbol

export interface ExportedPort {
  index: number;
  role: 'upstream' | 'downstream';
  label: string | null;
  position: { canvas_x: number; canvas_y: number };
  mrl: { value: number; unit: 'm' };
  /** ID of the pipe whose endpoint sits on this port, or null if unconnected. */
  connected_pipe_id: string | null;
  /** Element on the other end of the connected pipe (i.e. the adjacent element in the flow graph), or null. */
  connects_to_element_id: string | null;
  /** Port index on that adjacent element, or null. */
  connects_to_port_index: number | null;
}

export type SupplyMode = 'direct_supply' | 'indirect_supply' | null;

export interface ExportedElement {
  id: string;
  type: 'symbol';
  symbol_id: string;
  symbol_name: string;
  node_type: NodeType;
  position: { canvas_x: number; canvas_y: number };
  mrl: { value: number; unit: 'm' };
  /** Elevation above datum in metres — same value as mrl.value, explicit for readability. */
  elevation_m: number;
  /** Whether this element is before (direct_supply) or after (indirect_supply) the water meter. Null if no meter present or element is the meter itself. */
  supply_mode: SupplyMode;
  rotation_deg: number;
  scale_x: number;
  /** Per-port upstream/downstream detail — empty for custom symbols with no port definition. */
  ports: ExportedPort[];
  /** Flat list of all connected pipe IDs (convenience — same info as ports[].connected_pipe_id). */
  connected_pipe_ids: string[];
  /** Fitting sub-type — only present on water_fittings elements (e.g. "shower_tap", "basin_tap"). */
  fitting_type?: string;
  /** WELS tick rating — only present on water_fittings elements. */
  efficiency_rating?: 2 | 3;
  /** Fluid type flowing through this element — only present on tee_junction and elbow_bend. */
  pipe_type?: PipeType | null;
  /** Tank-specific properties — only present on water_tank elements. */
  tank_properties?: ExportedTankProperties;
  /** Capacity in litres — only present on long_bath elements. */
  long_bath_capacity_l?: number | null;
}

/**
 * Tank properties as written to the exported schematic JSON.
 * `effective_capacity_l` is derived from length × width × height for the backend's convenience.
 */
export interface ExportedTankProperties {
  material: string | null;
  pressure_vessel_present: boolean | null;

  // Dimensions
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  floor_level_m_amsl: number | null;

  // Inlet
  inlet_pipe_diameter_m: number | null;
  inlet_pipe_m_amsl: number | null;

  // Outlet
  outlet_pipe_diameter_m: number | null;
  distance_outlet_to_base_m: number | null;

  // Overflow
  overflow_pipe_diameter_m: number | null;
  overflow_pipe_m_amsl: number | null;

  // Warning
  warning_pipe_diameter_m: number | null;
  warning_pipe_m_amsl: number | null;

  // Supports
  support_height_m: number | null;

  /** Auto-calculated from L × W × H × 1000. Null if any dimension missing. */
  effective_capacity_l: number | null;
  is_sunken_tank: boolean | null;
}

export interface ExportedPipe {
  id: string;
  type: 'water_pipe';
  pipe_type: PipeType;
  start: { canvas_x: number; canvas_y: number; mrl: number };
  end: { canvas_x: number; canvas_y: number; mrl: number };
  /** Elevation at the start endpoint in metres. */
  start_elevation_m: number;
  /** Elevation at the end endpoint in metres. */
  end_elevation_m: number;
  /** Whether this pipe is before (direct_supply) or after (indirect_supply) the water meter. */
  supply_mode: SupplyMode;
  /** Element id whose port sits at this pipe's start point, or null (free end). */
  start_connects_to: string | null;
  /** Port index on that element, or null. */
  start_port_index: number | null;
  /** Role of the port on the start-end element that this pipe end connects to. */
  start_port_role: 'upstream' | 'downstream' | null;
  /** Element id whose port sits at this pipe's end point, or null (free end). */
  end_connects_to: string | null;
  /** Port index on that element, or null. */
  end_port_index: number | null;
  /** Role of the port on the end-end element that this pipe end connects to. */
  end_port_role: 'upstream' | 'downstream' | null;
  /**
   * Convenience: which element/port the flow enters this pipe from (the outlet/downstream port).
   * Null when the entry end is a free end.
   */
  flow_from_element_id: string | null;
  flow_from_port_index: number | null;
  /**
   * Convenience: which element/port the flow exits this pipe to (the inlet/upstream port).
   * Null when the exit end is a free end.
   */
  flow_to_element_id: string | null;
  flow_to_port_index: number | null;
  length_px: number;
  rotation_deg: number;
  /** Real-world pipe length in metres (user-entered). Null if not set. */
  length_m: number | null;
  /** Nominal pipe size in mm (15 / 22 / 28). Null if not set. */
  nominal_size_mm: NominalSizeMm | null;
  /** Pipe material: 'copper' or 'ss'. Null if not set. */
  material: PipeMaterial | null;
}

/**
 * High-level hydraulic interpretation of the drawing.
 * Tells Stage 2 agents what kind of system this is and whether
 * gravity head is sufficient to reach the outlets.
 */
export interface HydraulicContext {
  flow_mode: 'gravity' | 'pump_assisted' | 'undetermined';
  source_element_id: string | null;
  source_mrl_m: number | null;
  pump_element_ids: string[];
  lowest_outlet_mrl_m: number | null;
  gravity_head_available_m: number | null;
  gravity_head_sufficient: boolean | null;
  note: string;
}

export interface DrawingMetadata {
  schema_version: '1.0';
  exported_at: string;
  mrl_config: { upper_mrl: number; lower_mrl: number; unit: 'm AMSL'; range: number };
  canvas: { width_px: number; height_px: number };
  /** Source (mains) pressure in bar, as entered by the user. Null if not set. */
  source_pressure_bar: number | null;
  elements: ExportedElement[];
  pipes: ExportedPipe[];
  hydraulic_context: HydraulicContext;
  summary: {
    total_elements: number;
    total_pipes: number;
    total_pipe_length_px: number;
  };
}
