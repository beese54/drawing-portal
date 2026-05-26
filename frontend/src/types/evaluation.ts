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

export interface LlmUsage {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
}

export interface EvaluationResponse {
  check1_backflow: CheckResult;
  check2_supply_mode: CheckResult;
  check3_water_efficiency: CheckResult;
  check4_tank_pump: CheckResult;
  check5_long_bath: CheckResult;
  check6_hot_water: CheckResult;
  check7_section3_pipes: CheckResult;
  annotated_image_b64: string | null;
  llm_summary: string | null;
  llm_usage: LlmUsage | null;
}
