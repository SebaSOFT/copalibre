import { useState } from 'react';
import { FormattedMessage, type IntlShape } from 'react-intl';
import type { ConsoleSegment, MatchConsoleResponse } from '../../lib/api-client.js';
import { describeQueuedAction, type QueuedMutation } from '../../lib/offline-queue.js';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { ClockRing } from '../ui/organisms/clock-ring.js';
import { messages } from '../../i18n/messages.en.js';
import type { ConsoleStatus } from '../pages/MatchConsolePage.js';

/**
 * One component per section `MatchConsoleTemplate` composes into
 * `MatchConsoleLayout`'s slots: each section's own
 * conditionals now count toward its own function, not the template's, and
 * the template keeps only the composition itself. No behavior change — each
 * component's body is the section's prior inline JSX, unmodified.
 */
export function AlertsSection({
  intl,
  lastSyncedAt,
  onDismissMutation,
  pendingMutations,
  stale,
  status,
}: {
  readonly intl: IntlShape;
  readonly lastSyncedAt: number | undefined;
  readonly onDismissMutation: (mutationId: string) => void;
  readonly pendingMutations: readonly QueuedMutation[];
  readonly stale: boolean;
  readonly status: ConsoleStatus;
}): React.JSX.Element {
  const staleKey = String(lastSyncedAt ?? 'unknown');
  const [dismissedStaleKey, setDismissedStaleKey] = useState<string>();

  return (
    <>
      {status.kind === 'error' && <Alert tone="destructive">{status.message}</Alert>}
      {stale && dismissedStaleKey !== staleKey && (
        <Alert
          dismissLabel={intl.formatMessage(messages.toastDismiss)}
          onDismiss={() => setDismissedStaleKey(staleKey)}
          tone="warning"
        >
          <FormattedMessage {...messages.matchConsoleAwaitingProjection} />
        </Alert>
      )}
      {pendingMutations.some((mutation) => mutation.status === 'refused') && (
        <ul>
          {pendingMutations
            .filter((mutation) => mutation.status === 'refused')
            .map((mutation) => (
              <li key={mutation.id}>
                <Alert block tone="destructive">
                  <span>
                    {intl.formatMessage(messages.matchConsoleRefusedAction, {
                      kind: mutation.action.kind,
                      reason: mutation.refusalReason ?? '',
                    })}
                  </span>
                  {/* What was actually recorded, kept in front of the operator. A refusal
                    caused by a series decision means this match will never be played, and
                    these contents are the only basis for deciding whether the result
                    belongs elsewhere — as a correction to an earlier game, most often. */}
                  <span className="cl-card__description">
                    {intl.formatMessage(messages.matchConsoleRefusedContents, {
                      contents: describeQueuedAction(mutation.action),
                    })}
                  </span>
                  <Button
                    onClick={() => onDismissMutation(mutation.id)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.matchConsoleDismiss} />
                  </Button>
                </Alert>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

export function StatusSection({
  activeSegment,
  intl,
  matchStatus,
}: {
  readonly activeSegment: ConsoleSegment | undefined;
  readonly intl: IntlShape;
  readonly matchStatus: MatchConsoleResponse['status'];
}): React.JSX.Element {
  return (
    <>
      <strong>
        {matchStatus === 'in-progress'
          ? intl.formatMessage(messages.matchConsoleLive)
          : matchStatus.toUpperCase()}
      </strong>
      <ClockRing
        durationSeconds={activeSegment?.durationSeconds}
        elapsedSeconds={activeSegment?.elapsedSeconds ?? 0}
      />
    </>
  );
}
