import type { CheckResult, EvaluationResponse } from '../types/evaluation';

/** Shared with the backend's export.py STATUS_PRIORITY/ISSUE_PRIORITY — keep in sync. */
export const CHECK_STATUS_PRIORITY: Record<string, number> = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 };
export const ISSUE_STATUS_PRIORITY: Record<string, number> = { FAIL: 0, WARN: 1 };

export function getOrderedChecks(result: EvaluationResponse): CheckResult[] {
  return [
    result.check1_backflow,
    result.check2_supply_mode,
    result.check3_water_efficiency,
    result.check4_tank_pump,
    result.check5_long_bath,
    result.check6_hot_water,
    result.check7_section3_pipes,
  ].sort((a, b) => (CHECK_STATUS_PRIORITY[a.status] ?? 4) - (CHECK_STATUS_PRIORITY[b.status] ?? 4));
}
