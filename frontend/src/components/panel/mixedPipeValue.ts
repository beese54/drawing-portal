import type { PipeElement } from '../../types';

export function selectPipesByIds(pipeIds: string[], pipes: PipeElement[]): PipeElement[] {
  return pipes.filter((p) => pipeIds.includes(p.id));
}

/** Buckets `selected` by `bucketKey`; `mixed` is true iff more than one distinct bucket
 *  is present, in which case `current` is undefined rather than an arbitrary pick — the
 *  same "bucket first, don't just diff the raw value" shape that PipeColorPanel already
 *  needed (a mixed cold+hot pipe selection previously collapsed into one misleading
 *  colour swatch because two undefined customColors looked identical without bucketing
 *  by pipeType too). Shared so a future fix to this logic only needs applying once. */
export function computeMixedValue<T>(
  selected: PipeElement[],
  bucketKey: (p: PipeElement) => string,
  getValue: (p: PipeElement) => T,
): { mixed: boolean; current: T | undefined } {
  const buckets = new Set(selected.map(bucketKey));
  const mixed = buckets.size > 1;
  return { mixed, current: mixed || !selected[0] ? undefined : getValue(selected[0]) };
}
