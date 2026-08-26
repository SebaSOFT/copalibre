import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { isSupportedLanguage, resolveLabel } from '@copalibre/domain';
import {
  createControlApiClient,
  type ConsoleEventDefinition,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type RosterCandidate,
} from '../lib/api-client.js';
import {
  buildBulkLoadRequest,
  matchDataCsvTemplate,
  parseMatchDataCsv,
  type CsvRowError,
} from '../lib/match-data-builder.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

type LoadStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

interface MemberSelection {
  readonly included: boolean;
  readonly number: string;
  readonly onField: boolean;
  readonly roles: readonly string[];
}

interface SegmentRow {
  readonly key: string;
  readonly type: string;
  readonly elapsedSeconds: string;
}

interface EventRow {
  readonly key: string;
  readonly definitionCode: string;
  readonly segmentNumber: string;
  readonly occurredAt: string;
  readonly side: string;
  readonly personId: string;
  readonly notes: string;
}

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function toDatetimeLocalValue(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `FileReader`, not `Blob.text()` — universally supported, including older jsdom. */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}

/**
 * The bulk/structured entry screen (0106, 0147 template migration): a match's roster, its full event
 * history, and its result, submitted together — for a match played with no
 * live console present. Client-side only until "Submit match data" is
 * pressed; nothing here calls `setMatchRoster`/`recordMatchEvent`/
 * `finalizeMatch` directly, unlike `MatchConsoleRoute`'s live path.
 */
export function LoadMatchDataRoute({
  organizationAlias,
  tournamentAlias,
  matchId,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly client?: MatchConsoleApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [projection, setProjection] = useState<MatchConsoleResponse>();
  const [status, setStatus] = useState<LoadStatus>({ kind: 'loading' });
  const [candidatesByEntrant, setCandidatesByEntrant] = useState<
    Map<string, readonly RosterCandidate[]>
  >(new Map());
  const [selections, setSelections] = useState<Record<string, Record<string, MemberSelection>>>({});
  const [segments, setSegments] = useState<readonly SegmentRow[]>([]);
  const [events, setEvents] = useState<readonly EventRow[]>([]);
  const [winnerEntrantId, setWinnerEntrantId] = useState('');
  const [csvErrors, setCsvErrors] = useState<readonly CsvRowError[]>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .fetchMatchConsole(organizationAlias, tournamentAlias, matchId)
      .then(async (loaded) => {
        if (!live) return;
        setProjection(loaded);
        const entries = await Promise.all(
          loaded.entrantIds.map(
            async (entrantId) =>
              [
                entrantId,
                await api.fetchRosterCandidates(
                  organizationAlias,
                  tournamentAlias,
                  matchId,
                  entrantId,
                ),
              ] as const,
          ),
        );
        if (!live) return;
        setCandidatesByEntrant(new Map(entries));
        setSelections(
          Object.fromEntries(
            entries.map(([entrantId, candidates]) => [
              entrantId,
              Object.fromEntries(
                candidates.map((candidate) => [
                  candidate.personId,
                  { included: false, number: '', onField: false, roles: [] },
                ]),
              ),
            ]),
          ),
        );
        setStatus({ kind: 'ready' });
      })
      .catch(() =>
        live
          ? setStatus({
              kind: 'error',
              message: intl.formatMessage(messages.loadMatchDataLoadFailed),
            })
          : undefined,
      );
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, matchId, intl]);

  if (status.kind === 'loading' || !projection) {
    return (
      <p className="cl-inline-alert">
        {status.kind === 'error'
          ? status.message
          : intl.formatMessage(messages.loadMatchDataLoading)}
      </p>
    );
  }

  const hasCapability = (capability: (typeof projection.capabilities)[number]): boolean =>
    projection.capabilities.includes(capability);
  const canBulkLoad =
    hasCapability('match.select-roster') &&
    hasCapability('match.record-event') &&
    hasCapability('match.finalize');
  const hasPriorActivity =
    projection.segments.length > 0 || projection.events.length > 0 || projection.result !== null;

  if (!canBulkLoad) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.loadMatchDataForbidden)}</p>;
  }
  if (hasPriorActivity) {
    return (
      <p className="cl-inline-alert">{intl.formatMessage(messages.loadMatchDataNotScheduled)}</p>
    );
  }

  const includedMembers = projection.entrantIds.flatMap((entrantId) => {
    const candidates = candidatesByEntrant.get(entrantId) ?? [];
    return candidates
      .filter((candidate) => selections[entrantId]?.[candidate.personId]?.included)
      .map((candidate) => ({ personId: candidate.personId, name: candidate.name, entrantId }));
  });

  function updateSelection(
    entrantId: string,
    personId: string,
    patch: Partial<MemberSelection>,
  ): void {
    setSelections((current) => ({
      ...current,
      [entrantId]: {
        ...current[entrantId],
        [personId]: {
          ...(current[entrantId]?.[personId] ?? {
            included: false,
            number: '',
            onField: false,
            roles: [],
          }),
          ...patch,
        },
      },
    }));
  }

  function addSegment(): void {
    setSegments((current) => [...current, { key: nextKey(), type: '', elapsedSeconds: '' }]);
  }
  function updateSegment(key: string, patch: Partial<SegmentRow>): void {
    setSegments((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeSegment(key: string): void {
    setSegments((current) => current.filter((row) => row.key !== key));
  }

  function addEvent(): void {
    if (!projection) return;
    const last = events[events.length - 1];
    setEvents((current) => [
      ...current,
      {
        key: nextKey(),
        definitionCode: projection.eventDefinitions[0]?.code ?? '',
        segmentNumber: segments.length > 0 ? '1' : '',
        occurredAt: last?.occurredAt ?? toDatetimeLocalValue(Date.now()),
        side: '',
        personId: '',
        notes: '',
      },
    ]);
  }
  function updateEvent(key: string, patch: Partial<EventRow>): void {
    setEvents((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeEvent(key: string): void {
    setEvents((current) => current.filter((row) => row.key !== key));
  }
  function moveEvent(key: string, direction: -1 | 1): void {
    setEvents((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      if (!row) return current;
      next.splice(target, 0, row);
      return next;
    });
  }

  function loadCsv(file: File): void {
    readFileText(file)
      .then((text) => {
        const result = parseMatchDataCsv(text, candidatesByEntrant);
        if (!result.ok) {
          setCsvErrors(result.errors);
          return;
        }
        setCsvErrors(undefined);
        setSelections((current) => {
          const next = { ...current };
          for (const roster of result.value.rosters) {
            const entrant = { ...(next[roster.entrantId] ?? {}) };
            for (const member of roster.members) {
              entrant[member.personId] = {
                included: true,
                number: member.number !== undefined ? String(member.number) : '',
                onField: member.onField,
                roles: member.roles ?? [],
              };
            }
            next[roster.entrantId] = entrant;
          }
          return next;
        });
        setSegments(
          result.value.segments.map((segment) => ({
            key: nextKey(),
            type: segment.type,
            elapsedSeconds:
              segment.elapsedSeconds !== undefined ? String(segment.elapsedSeconds) : '',
          })),
        );
        setEvents(
          result.value.events.map((event) => ({
            key: nextKey(),
            definitionCode: event.definitionCode,
            segmentNumber: String(event.segmentNumber),
            occurredAt: toDatetimeLocalValue(event.occurredAt),
            side: event.side ?? '',
            personId: event.personId ?? '',
            notes: event.notes ?? '',
          })),
        );
        if (result.value.winnerEntrantId) setWinnerEntrantId(result.value.winnerEntrantId);
      })
      .catch(() =>
        setCsvErrors([{ row: 0, message: intl.formatMessage(messages.loadMatchDataLoadFailed) }]),
      );
  }

  async function submit(): Promise<void> {
    if (!projection) return;
    setSubmitting(true);
    const request = buildBulkLoadRequest({
      rosters: projection.entrantIds.map((entrantId) => ({
        entrantId,
        members: Object.entries(selections[entrantId] ?? {})
          .filter(([, selection]) => selection.included)
          .map(([personId, selection]) => ({
            personId,
            onField: selection.onField,
            ...(selection.number.trim() === '' ? {} : { number: selection.number.trim() }),
            ...(selection.roles.length === 0 ? {} : { roles: [...selection.roles] }),
          })),
      })),
      segments: segments.map((row) => ({
        type: row.type,
        ...(row.elapsedSeconds.trim() === '' ? {} : { elapsedSeconds: Number(row.elapsedSeconds) }),
      })),
      events: events.map((row) => ({
        definitionCode: row.definitionCode,
        segmentNumber: Number(row.segmentNumber),
        occurredAt: new Date(row.occurredAt).getTime(),
        ...(row.side === '' ? {} : { side: row.side }),
        ...(row.personId === '' ? {} : { personId: row.personId }),
        ...(row.notes.trim() === '' ? {} : { notes: row.notes.trim() }),
      })),
      entrantIds: projection.entrantIds,
      ...(winnerEntrantId ? { winnerEntrantId } : {}),
    });
    try {
      const response = await api.bulkLoadMatch(
        organizationAlias,
        tournamentAlias,
        matchId,
        request,
      );
      // Entered data is intentionally left in place on success too — an
      // operator reviewing the just-submitted batch is a legitimate need,
      // and there is no live projection here to reload into its place.
      push({
        severity: 'success',
        message: intl.formatMessage(messages.loadMatchDataSubmitSucceeded, {
          eventCount: response.eventCount,
        }),
      });
    } catch (error) {
      pushError(error);
    } finally {
      setSubmitting(false);
    }
  }

  const breadcrumbNode = (
    <span>
      {intl.formatMessage(messages.loadMatchDataBreadcrumb, {
        tournamentAlias,
        matchId: matchId.slice(-8),
      })}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.loadMatchDataTitle} />;

  const listingNode = (
    <div className="cl-platform-sections">
      <section
        aria-label={intl.formatMessage(messages.loadMatchDataRosterHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.loadMatchDataRosterHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          {projection.entrantIds.map((entrantId) => {
            const candidates = candidatesByEntrant.get(entrantId);
            return (
              <div key={entrantId} className="cl-card cl-chamfer cl-chamfer--control">
                <header className="cl-card__header">
                  <h3 className="cl-label">
                    {projection.rosters.find((roster) => roster.entrantId === entrantId)
                      ?.teamName ?? entrantId.slice(-8)}
                  </h3>
                </header>
                <div className="cl-card__content">
                  {!candidates ? (
                    <p>{intl.formatMessage(messages.loadMatchDataRosterCandidatesLoading)}</p>
                  ) : (
                    <ul>
                      {candidates.map((candidate) => {
                        const selection = selections[entrantId]?.[candidate.personId];
                        if (!selection) return null;
                        return (
                          <li key={candidate.personId} className="cl-role-user">
                            <label className="cl-form-field">
                              <input
                                checked={selection.included}
                                onChange={(event) =>
                                  updateSelection(entrantId, candidate.personId, {
                                    included: event.target.checked,
                                  })
                                }
                                type="checkbox"
                              />
                              {candidate.name}
                            </label>
                            <input
                              aria-label={`${candidate.name} number`}
                              className="cl-input cl-input--default"
                              disabled={!selection.included}
                              onChange={(event) =>
                                updateSelection(entrantId, candidate.personId, {
                                  number: event.target.value,
                                })
                              }
                              value={selection.number}
                            />
                            <label className="cl-form-field">
                              <input
                                checked={selection.onField}
                                disabled={!selection.included}
                                onChange={(event) =>
                                  updateSelection(entrantId, candidate.personId, {
                                    onField: event.target.checked,
                                  })
                                }
                                type="checkbox"
                              />
                              {intl.formatMessage(messages.matchConsoleOnField)}
                            </label>
                            {projection.rosterRoles.length > 0 && (
                              <span className="cl-role-user">
                                {projection.rosterRoles.map((role) => (
                                  <label key={role.code} className="cl-form-field">
                                    <input
                                      checked={selection.roles.includes(role.code)}
                                      disabled={!selection.included}
                                      onChange={(event) =>
                                        updateSelection(entrantId, candidate.personId, {
                                          roles: event.target.checked
                                            ? [...selection.roles, role.code]
                                            : selection.roles.filter((code) => code !== role.code),
                                        })
                                      }
                                      type="checkbox"
                                    />
                                    {role.badge ?? role.code}
                                  </label>
                                ))}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataSegmentsHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.loadMatchDataSegmentsHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {segments.map((row, index) => (
              <li key={row.key} className="cl-role-user">
                <strong>{index + 1}</strong>
                <label className="cl-form-field">
                  <span className="cl-label">
                    <FormattedMessage {...messages.loadMatchDataSegmentType} />
                  </span>
                  <input
                    aria-label={intl.formatMessage(messages.loadMatchDataSegmentType)}
                    className="cl-input cl-input--default"
                    onChange={(event) => updateSegment(row.key, { type: event.target.value })}
                    placeholder={intl.formatMessage(messages.loadMatchDataSegmentTypePlaceholder)}
                    value={row.type}
                  />
                </label>
                <label className="cl-form-field">
                  <span className="cl-label">
                    <FormattedMessage {...messages.loadMatchDataSegmentElapsedSeconds} />
                  </span>
                  <input
                    aria-label={intl.formatMessage(messages.loadMatchDataSegmentElapsedSeconds)}
                    className="cl-input cl-input--default"
                    min="0"
                    onChange={(event) =>
                      updateSegment(row.key, { elapsedSeconds: event.target.value })
                    }
                    type="number"
                    value={row.elapsedSeconds}
                  />
                </label>
                <Button onClick={() => removeSegment(row.key)} type="button" variant="secondary">
                  <FormattedMessage {...messages.loadMatchDataRemoveSegment} />
                </Button>
              </li>
            ))}
          </ul>
          <Button onClick={addSegment} type="button" variant="secondary">
            <FormattedMessage {...messages.loadMatchDataAddSegment} />
          </Button>
        </div>
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataEventsHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.loadMatchDataEventsHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          {events.length === 0 && (
            <p className="cl-card__description">
              {intl.formatMessage(messages.loadMatchDataNoEvents)}
            </p>
          )}
          <ol className="cl-platform-update-list">
            {events.map((row, index) => (
              <li key={row.key} className="cl-card cl-chamfer cl-chamfer--control">
                <div className="cl-platform-form-grid">
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventDefinition} />
                    </span>
                    <select
                      aria-label={intl.formatMessage(messages.loadMatchDataEventDefinition)}
                      className="cl-select cl-select--default"
                      onChange={(event) =>
                        updateEvent(row.key, { definitionCode: event.target.value })
                      }
                      value={row.definitionCode}
                    >
                      {projection.eventDefinitions.map((definition: ConsoleEventDefinition) => (
                        <option key={definition.code} value={definition.code}>
                          {resolveLabel(definition.label, language)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventSegment} />
                    </span>
                    <select
                      aria-label={intl.formatMessage(messages.loadMatchDataEventSegment)}
                      className="cl-select cl-select--default"
                      onChange={(event) =>
                        updateEvent(row.key, { segmentNumber: event.target.value })
                      }
                      value={row.segmentNumber}
                    >
                      <option value="" />
                      {segments.map((segment, segmentIndex) => (
                        <option key={segment.key} value={String(segmentIndex + 1)}>
                          {segmentIndex + 1}. {segment.type || '—'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventOccurredAt} />
                    </span>
                    <input
                      aria-label={intl.formatMessage(messages.loadMatchDataEventOccurredAt)}
                      className="cl-input cl-input--default"
                      onChange={(event) => updateEvent(row.key, { occurredAt: event.target.value })}
                      type="datetime-local"
                      value={row.occurredAt}
                    />
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventSide} />
                    </span>
                    <select
                      aria-label={intl.formatMessage(messages.loadMatchDataEventSide)}
                      className="cl-select cl-select--default"
                      onChange={(event) => updateEvent(row.key, { side: event.target.value })}
                      value={row.side}
                    >
                      <option value="">
                        {intl.formatMessage(messages.loadMatchDataEventNoAttribution)}
                      </option>
                      {projection.entrantIds.map((entrantId) => (
                        <option key={entrantId} value={entrantId}>
                          {entrantId.slice(-8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventPerson} />
                    </span>
                    <select
                      aria-label={intl.formatMessage(messages.loadMatchDataEventPerson)}
                      className="cl-select cl-select--default"
                      onChange={(event) => updateEvent(row.key, { personId: event.target.value })}
                      value={row.personId}
                    >
                      <option value="">
                        {intl.formatMessage(messages.loadMatchDataEventNoAttribution)}
                      </option>
                      {includedMembers.map((member) => (
                        <option key={member.personId} value={member.personId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.loadMatchDataEventNotes} />
                    </span>
                    <input
                      aria-label={intl.formatMessage(messages.loadMatchDataEventNotes)}
                      className="cl-input cl-input--default"
                      onChange={(event) => updateEvent(row.key, { notes: event.target.value })}
                      value={row.notes}
                    />
                  </label>
                </div>
                <div className="cl-role-user">
                  <Button
                    disabled={index === 0}
                    onClick={() => moveEvent(row.key, -1)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.loadMatchDataMoveEventUp} />
                  </Button>
                  <Button
                    disabled={index === events.length - 1}
                    onClick={() => moveEvent(row.key, 1)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.loadMatchDataMoveEventDown} />
                  </Button>
                  <Button onClick={() => removeEvent(row.key)} type="button" variant="secondary">
                    <FormattedMessage {...messages.loadMatchDataRemoveEvent} />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button onClick={addEvent} type="button" variant="secondary">
            <FormattedMessage {...messages.loadMatchDataAddEvent} />
          </Button>
        </div>
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataCsvHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.loadMatchDataCsvHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <p className="cl-card__description">
            {intl.formatMessage(messages.loadMatchDataCsvHelp)}
          </p>
          <div className="cl-role-user">
            <label className="cl-btn cl-btn--secondary cl-focusable">
              {intl.formatMessage(messages.loadMatchDataCsvChooseFile)}
              <input
                accept=".csv,text/csv"
                aria-label={intl.formatMessage(messages.loadMatchDataCsvChooseFile)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) loadCsv(file);
                  event.target.value = '';
                }}
                style={{ display: 'none' }}
                type="file"
              />
            </label>
            <Button onClick={() => downloadCsvTemplate()} type="button" variant="secondary">
              <FormattedMessage {...messages.loadMatchDataCsvDownloadTemplate} />
            </Button>
          </div>
          {csvErrors && csvErrors.length > 0 && (
            <div className="cl-inline-alert" role="alert">
              <p>
                {intl.formatMessage(messages.loadMatchDataCsvErrorsHeading, {
                  count: csvErrors.length,
                })}
              </p>
              <ul>
                {csvErrors.map((error, index) => (
                  <li key={index}>
                    {error.row > 0 ? `Row ${error.row}: ` : ''}
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataResultHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.loadMatchDataResultHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <label className="cl-form-field">
            <span className="cl-label">
              <FormattedMessage {...messages.loadMatchDataWinner} />
            </span>
            <select
              aria-label={intl.formatMessage(messages.loadMatchDataWinner)}
              className="cl-select cl-select--default"
              onChange={(event) => setWinnerEntrantId(event.target.value)}
              value={winnerEntrantId}
            >
              <option value="">{intl.formatMessage(messages.loadMatchDataNoWinnerDraw)}</option>
              {projection.entrantIds.map((entrantId) => (
                <option key={entrantId} value={entrantId}>
                  {entrantId.slice(-8)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="cl-card__footer">
          <Button disabled={submitting} onClick={() => void submit()} type="button">
            {submitting
              ? intl.formatMessage(messages.loadMatchDataSubmitting)
              : intl.formatMessage(messages.loadMatchDataSubmit)}
          </Button>
        </footer>
      </section>
    </div>
  );

  return <ListScreenTemplate breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}

function downloadCsvTemplate(): void {
  const blob = new Blob([matchDataCsvTemplate()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'copalibre-match-data-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
