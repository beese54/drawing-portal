export interface CheckResult {
  check_id: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  summary: string;
  detail: string[];
  table?: WelsRow[] | null;
  elements_of_interest?: Array<{ element_id: string; label: string; color: string }>;
}

export interface WelsRow {
  element_id: string;
  name: string;
  ticks: number | null;
  design_flow: number | null;
  unit: string;
  compliant: boolean | null;
  note?: string | null;
}

export interface PipeHydraulics {
  id: string;
  from_element_name: string;
  to_element_name: string;
  pipe_type: 'cold' | 'hot' | string;
  length_m: number | null;
  nominal_size_mm: number | null;
  material: string | null;
  flow_lpm: number | null;
  velocity_ms: number | null;
  friction_loss_bar: number | null;
}

export interface HydraulicAggregate {
  status: 'PASS' | 'FAIL' | 'WARN' | 'N/A';
  outlets_total: number;
  outlets_adequate: number;
  min_residual_bar: number | null;
  max_residual_bar: number | null;
  highest_elevation_m: number | null;
  highest_fitting_type: string | null;
  highest_fitting_pressure_bar: number | null;
  source_elevation_m?: number | null;
}

export interface FittingHydraulics {
  id: string;
  fitting_type: string;
  ticks: number | null;
  design_flow_lpm: number | null;
  residual_pressure_bar: number | null;
  elevation_m: number;
  is_highest: boolean;
  disconnected?: boolean;
  calculation_error?: boolean;
}

export interface LlmUsage {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
}

export interface HydraulicReport {
  source_pressure_bar: number | null;
  source_elevation_m?: number | null;
  total_demand_lpm: number;
  pipes: PipeHydraulics[];
  fittings: FittingHydraulics[];
  note: string;
  aggregate?: HydraulicAggregate;
}

export interface EvaluationResponse {
  check1_backflow: CheckResult;
  check2_supply_mode: CheckResult;
  check3_water_efficiency: CheckResult;
  check4_tank_pump: CheckResult;
  check5_long_bath: CheckResult;
  hydraulic_report: HydraulicReport;
  annotated_image_b64: string | null;
  llm_summary: string | null;
  llm_usage: LlmUsage | null;
}
