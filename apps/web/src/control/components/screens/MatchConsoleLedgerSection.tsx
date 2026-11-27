import { useContext, type Dispatch, type SetStateAction } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  ConsoleMatchEvent,
  ConsoleSegment,
  MatchConsoleResponse,
} from '../../lib/api-client.js';
import { eventSyncKey, formatClock, segmentLabel } from '../../lib/match-console.js';
import type { QueuedMutation } from '../../lib/offline-queue.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Field } from '../ui/molecules/field.js';
import { Textarea } from '../ui/atoms/textarea.js';
import { EventSyncMark, type EventSyncState } from '../ui/molecules/event-sync-mark.js';
import { messages } from '../../i18n/messages.en.js';
import { ResponsiveTimestamp } from '../../../components/ui/atoms/ResponsiveTimestamp.js';
import { PageHeaderContext } from '../ui/organisms/page-header.js';

export type EventCategory = 'all' | 'positive' | 'negative' | 'neutral';

export interface MatchConsoleLedgerSectionProps {
  readonly eventCategory: EventCategory;
  readonly eventEntryIds: ReadonlySet<string>;
  readonly eventSyncStates: Readonly<
    Record<string, { readonly state: EventSyncState; readonly refusalReason?: string }>
  >;
  readonly ledgerEvents: readonly ConsoleMatchEvent[];
  readonly ledgerExpanded: boolean;
  readonly logNote: string;
  readonly pendingMutations: readonly QueuedMutation[];
  readonly projection: MatchConsoleResponse;
  readonly segmentTypeText: (segment: ConsoleSegment) => string;
  readonly setEventCategory: Dispatch<SetStateAction<EventCategory>>;
  readonly setLedgerExpanded: Dispatch<SetStateAction<boolean>>;
  readonly setLogNote: Dispatch<SetStateAction<string>>;
}

/** The event ledger card: category filter, the events with their sync marks, and the log note. */
export function MatchConsoleLedgerSection({
  eventCategory,
  eventEntryIds,
  eventSyncStates,
  ledgerEvents,
  ledgerExpanded,
  logNote,
  pendingMutations,
  projection,
  segmentTypeText,
  setEventCategory,
  setLedgerExpanded,
  setLogNote,
}: MatchConsoleLedgerSectionProps): React.JSX.Element {
  const intl = useIntl();
  const pageHeader = useContext(PageHeaderContext);

  return (
    <Card className="cl-chamfer cl-chamfer--control">
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.matchConsoleEventLedger} />
        </h2>
        {/* Collapsed is the default because the recording controls above have
              to fit one screen during play; the peek strip is what keeps
              collapsing from hiding the event just recorded from the operator
              who just recorded it. */}
        <Button
          aria-expanded={ledgerExpanded}
          onClick={() => setLedgerExpanded((expanded) => !expanded)}
          type="button"
          variant="secondary"
        >
          <FormattedMessage
            {...(ledgerExpanded
              ? messages.matchConsoleCollapseLedger
              : messages.matchConsoleExpandLedger)}
          />
        </Button>
      </header>
      <div className="cl-card__content">
        <div className="cl-role-user">
          {(['all', 'positive', 'negative', 'neutral'] as const).map((category) => (
            <Button
              aria-pressed={eventCategory === category}
              key={category}
              onClick={() => setEventCategory(category)}
              type="button"
              variant="secondary"
            >
              {intl.formatMessage(
                category === 'all'
                  ? messages.matchConsoleAll
                  : category === 'positive'
                    ? messages.matchConsoleCategoryPositive
                    : category === 'negative'
                      ? messages.matchConsoleCategoryNegative
                      : messages.matchConsoleCategoryNeutral,
              )}
            </Button>
          ))}
        </div>
        {ledgerEvents.length === 0 ? (
          <p className="cl-card__description">
            <FormattedMessage {...messages.matchConsoleNoEvents} />
          </p>
        ) : (
          <ol className="cl-platform-update-list">
            {ledgerEvents.map((event) => {
              const key = eventSyncKey(event);
              const queueEntry = pendingMutations.find(
                (mutation) =>
                  mutation.action.kind === 'record-event' &&
                  eventSyncKey({
                    definitionCode: mutation.action.request.definitionCode,
                    segmentId: mutation.action.request.segmentId,
                    occurredAt: new Date(mutation.action.request.occurredAt).toISOString(),
                  }) === key,
              );
              const explicitState = eventSyncStates[key];
              const syncState =
                explicitState ??
                (queueEntry
                  ? {
                      state: queueEntry.status === 'refused' ? 'refused' : 'queued',
                      ...(queueEntry.refusalReason === undefined
                        ? {}
                        : { refusalReason: queueEntry.refusalReason }),
                    }
                  : undefined);
              return (
                <li
                  key={key}
                  className={`cl-role-user${eventEntryIds.has(key) ? ' cl-enter-once' : ''}`}
                >
                  <strong>
                    {event.definitionCode} ·{' '}
                    {segmentLabel(
                      projection,
                      event.segmentId,
                      intl.formatMessage(messages.matchConsoleUnknownSegment),
                      segmentTypeText,
                    )}
                    {event.segmentElapsedSeconds === undefined
                      ? null
                      : ` · ${formatClock(event.segmentElapsedSeconds)}`}
                  </strong>
                  <ResponsiveTimestamp
                    locale={intl.locale}
                    timeZone={pageHeader?.organizationTimeZone}
                    timestamp={event.occurredAt}
                  />
                  {syncState && (
                    <EventSyncMark
                      acknowledged={syncState.state === 'confirmed'}
                      labels={{
                        queued: intl.formatMessage(messages.interactionQueued),
                        sent: intl.formatMessage(messages.interactionSent),
                        confirmed: intl.formatMessage(messages.interactionConfirmed),
                        refused: intl.formatMessage(messages.interactionRefused),
                      }}
                      refusalReason={syncState.refusalReason}
                      state={syncState.state}
                    />
                  )}
                  {event.notes ? <p className="cl-card__description">{event.notes}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
        <Field id="console-log-note" label={intl.formatMessage(messages.matchConsoleLogNote)}>
          <Textarea
            aria-label={intl.formatMessage(messages.matchConsoleLogNote)}
            id="console-log-note"
            onChange={(event) => setLogNote(event.target.value)}
            placeholder=""
            value={logNote}
          />
        </Field>
      </div>
    </Card>
  );
}
