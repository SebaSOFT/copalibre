import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';

/**
 * How long a match is expected to hold its venue and its entrants, in minutes.
 *
 * The estimate is the discipline's regulation: its first segment type — the one every match
 * plays (a half, a period) — times the regulation count, with the tournament ruleset's
 * `segments` override taking the place of the discipline default. Conditional segments
 * (extra time, a shootout) are left out on purpose: they are not regulation, and counting
 * them would turn every pair of close matches into a conflict.
 *
 * `undefined` means there is no honest estimate — a discipline played to sets, or a timed
 * segment with no declared length — and a caller falls back to the slot's own length. Both
 * conflict detection and every timeline drawing of a match read this one function, so the
 * two can never disagree about how long a match lasts.
 */
export function estimatedMatchMinutes(
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes' | 'defaults'>,
  overrides: Readonly<Record<string, unknown>> = {},
): number | undefined {
  const regulation = descriptor.segmentTypes[0];
  if (!regulation?.timed) return undefined;
  const seconds = regulation.defaultDurationSeconds;
  if (seconds === undefined || seconds <= 0) return undefined;

  const count =
    regulationCountOf(overrides['segments']) ?? regulationCountOf(segmentsDefault(descriptor));
  if (count === undefined) return undefined;
  return Math.ceil((seconds * count) / 60);
}

function segmentsDefault(descriptor: Pick<DisciplineDescriptor, 'defaults'>): unknown {
  return (descriptor.defaults as Readonly<Record<string, unknown>> | undefined)?.['segments'];
}

function regulationCountOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const count = (value as { readonly regulationCount?: unknown }).regulationCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : undefined;
}
