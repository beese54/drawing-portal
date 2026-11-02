/**
 * titleBlockRequirements.ts — which title block fields a submission must fill.
 *
 * One table, read by the Sheet Setup form (red asterisks) and by the PDF export and
 * Evaluate buttons (the "missing mandatory fields" check), so the two cannot disagree.
 */
import type { SubmissionType, TitleBlockData } from '../types';

type RequirableField =
  | 'structuralEngineer'
  | 'structuralEngineerStamp'
  | 'projectName'
  | 'mainContractor'
  | 'plumbingContractor'
  | 'lpPeStamp';

/** Labels as the Sheet Setup form shows them. */
export const REQUIRABLE_FIELD_LABELS: Record<RequirableField, string> = {
  structuralEngineer:      'Professional Engineer',
  structuralEngineerStamp: 'PE Stamp & Signature',
  projectName:             'Project Title',
  mainContractor:          'Main Contractor',
  plumbingContractor:      'Licensed Plumber',
  lpPeStamp:               'LP Stamp & Signature',
};

const COMMON: RequirableField[] = ['projectName', 'mainContractor'];

const REQUIRED_BY_TYPE: Record<SubmissionType, RequirableField[]> = {
  PE: ['structuralEngineer', 'structuralEngineerStamp', ...COMMON],
  LP: [...COMMON, 'plumbingContractor', 'lpPeStamp'],
};

/** True when `field` is mandatory for the given submission type. */
export function isRequired(type: SubmissionType | undefined, field: RequirableField): boolean {
  return type ? REQUIRED_BY_TYPE[type].includes(field) : COMMON.includes(field);
}

/**
 * Labels of the mandatory fields still empty, in form order. With no submission type
 * chosen, that is the first entry, followed by the fields every submission needs.
 */
export function missingTitleBlockFields(tb: TitleBlockData): string[] {
  const type = tb.submissionType;
  const missing: string[] = type ? [] : ['Submission Type'];
  for (const field of type ? REQUIRED_BY_TYPE[type] : COMMON) {
    if (!(tb[field] ?? '').trim()) missing.push(REQUIRABLE_FIELD_LABELS[field]);
  }
  return missing;
}
