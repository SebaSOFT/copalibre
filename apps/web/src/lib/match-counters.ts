import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { LiveMatchCounter } from './live-state.js';
import { applyTemplate } from './matches-view.js';

/** Catalogue templates a counter reads through, in the page language. */
export interface MatchCounterTexts {
  /** "{label}: {value}" */
  readonly accessibleValue: string;
  /** "{label}: {value} of {allowance}" */
  readonly accessibleAllowance: string;
  /** Appended to the accessible name of a counter in warning. */
  readonly warning: string;
}

export interface MatchCounterSideView {
  readonly entrantId: string;
  readonly value: number;
  /** The value, or "value/allowance" when the counter has an allowance. */
  readonly valueText: string;
  /** Short label and value, "F 4" or "TM 1/1": for compact graphics. */
  readonly compactText: string;
  /** Full label and value, "Team fouls 4": for a wide surface. */
  readonly fullText: string;
  /** The full label and value in words, with the warning when in warning. */
  readonly accessibleName: string;
  /** At or past the warning value, or the allowance when no warning value is set. */
  readonly warning: boolean;
}

export interface MatchCounterView {
  readonly code: string;
  readonly label: string;
  readonly sides: readonly MatchCounterSideView[];
}

/**
 * The counters of one match, ready to show in the page language. Each side reads its value from
 * the projection and is never clamped: a value past the allowance is shown as it is, and flagged.
 * Counters are display only. Nothing here refuses or blocks a recording.
 */
export function matchCounterView(
  counters: readonly LiveMatchCounter[] | undefined,
  sides: readonly { readonly entrantId: string }[],
  language: SupportedLanguage,
  texts: MatchCounterTexts,
): readonly MatchCounterView[] {
  return (counters ?? []).map((counter) => {
    const label = resolveLabel(counter.label, language);
    const shortLabel = resolveLabel(counter.shortLabel, language);
    const warningAt = counter.warnAt ?? counter.allowance;
    return {
      code: counter.code,
      label,
      sides: sides.map((side) => {
        const value =
          counter.values.find((entry) => entry.entrantId === side.entrantId)?.value ?? 0;
        const valueText =
          counter.allowance === undefined ? `${value}` : `${value}/${counter.allowance}`;
        const warning = warningAt !== undefined && value >= warningAt;
        const words =
          counter.allowance === undefined
            ? applyTemplate(texts.accessibleValue, { label, value })
            : applyTemplate(texts.accessibleAllowance, {
                label,
                value,
                allowance: counter.allowance,
              });
        return {
          entrantId: side.entrantId,
          value,
          valueText,
          compactText: `${shortLabel} ${valueText}`,
          fullText: `${label} ${valueText}`,
          accessibleName: warning ? `${words}, ${texts.warning}` : words,
          warning,
        };
      }),
    };
  });
}
