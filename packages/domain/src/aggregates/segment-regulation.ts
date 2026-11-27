/**
 * The regulation readings shared by the scheduling estimate and the live plan, so that the
 * two never disagree about how many segments a match is expected to have.
 */

export function segmentsDefaultOf(
  defaults: Readonly<Record<string, unknown>> | undefined,
): unknown {
  return defaults?.['segments'];
}

export function regulationCountOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const count = (value as { readonly regulationCount?: unknown }).regulationCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : undefined;
}

export function bestOfOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const bestOf = (value as { readonly bestOf?: unknown }).bestOf;
  return typeof bestOf === 'number' && Number.isInteger(bestOf) && bestOf > 0 && bestOf % 2 === 1
    ? bestOf
    : undefined;
}
