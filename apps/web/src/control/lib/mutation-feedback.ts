import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';

type MutationClass = 'safe' | 'requires_rebuild' | 'blocked_after_results';

export type MutationFeedback =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'warning';
      readonly descriptor: MessageDescriptor;
      readonly values?: Readonly<Record<string, string | number>>;
    }
  | {
      readonly kind: 'blocked';
      readonly descriptor: MessageDescriptor;
      readonly values?: Readonly<Record<string, string | number>>;
    };

/**
 * Returns a message descriptor (plus any ICU interpolation values), not a
 * formatted string — this stays a plain, `intl`-free function testable
 * without a React context; the caller formats via `useIntl().formatMessage()`
 *.
 */
export function mutationFeedback(input: {
  readonly mutationClass: MutationClass;
  readonly hasRecordedResults: boolean;
  readonly invalidatedFixtureCount?: number;
}): MutationFeedback {
  if (input.mutationClass === 'safe') return { kind: 'none' };

  if (input.mutationClass === 'blocked_after_results' && input.hasRecordedResults) {
    return { kind: 'blocked', descriptor: messages.mutationBlockedAfterResults };
  }

  if (input.mutationClass === 'requires_rebuild') {
    const count = input.invalidatedFixtureCount ?? 0;
    return {
      kind: 'warning',
      descriptor: messages.mutationRequiresRebuild,
      values: { count },
    };
  }

  return { kind: 'none' };
}
