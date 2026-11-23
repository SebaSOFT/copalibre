import type { LocalizedLabel, SupportedLanguage } from '@copalibre/domain';
import type { LiveMatchClock, LiveSegment } from './live-state.js';
import { localizedText } from './localized-label.js';
import { segmentOrdinalLabel } from './segment-ordinal.js';

export type SegmentLabelInput = Omit<LiveSegment, 'label'> & {
  readonly label?: string | Readonly<Record<string, unknown>>;
};

/**
 * Resolves the active segment's localized display label (e.g., es `"1er tiempo"`, en `"1st Half"`).
 * A segment type played once in a match is named without an ordinal (e.g., `"Overtime"`).
 */
export function activeSegmentLabel(
  segments: readonly SegmentLabelInput[] | undefined,
  clock: Pick<LiveMatchClock, 'segmentNumber'> | undefined,
  language: SupportedLanguage,
): string | undefined {
  if (!segments || segments.length === 0) return undefined;
  const active =
    (clock !== undefined
      ? segments.find((segment) => segment.number === clock.segmentNumber)
      : undefined) ?? segments.find((segment) => segment.state === 'active');
  if (!active) return undefined;

  const baseLabel =
    active.label === undefined
      ? active.type
      : localizedText(active.label as string | LocalizedLabel, language);
  const ofType = segments.filter((segment) => segment.type === active.type);
  if (ofType.length < 2) return baseLabel;
  return segmentOrdinalLabel(baseLabel, ofType.indexOf(active) + 1, language);
}
