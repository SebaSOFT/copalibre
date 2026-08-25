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
 * The bulk/structured entry screen (0106): a match's roster, its full event
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
  const { push, pushError } = useToast();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
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

  return (
    <section aria-label={intl.formatMessage(messages.loadMatchDataSectionLabel)} style={pageStyle}>
      <header>
        <p style={metaStyle}>
          {intl.formatMessage(messages.loadMatchDataBreadcrumb, {
            tournamentAlias,
            matchId: matchId.slice(-8),
          })}
        </p>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.loadMatchDataTitle} />
        </h1>
      </header>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataRosterHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.loadMatchDataRosterHeading} />
        </h2>
        {projection.entrantIds.map((entrantId) => {
          const candidates = candidatesByEntrant.get(entrantId);
          return (
            <div
              key={entrantId}
              className="cl-card cl-chamfer cl-chamfer--control"
              style={editorStyle}
            >
              <h3 style={entrantHeaderStyle}>
                {projection.rosters.find((roster) => roster.entrantId === entrantId)?.teamName ??
                  entrantId.slice(-8)}
              </h3>
              {!candidates ? (
                <p>{intl.formatMessage(messages.loadMatchDataRosterCandidatesLoading)}</p>
              ) : (
                <ul style={listStyle}>
                  {candidates.map((candidate) => {
                    const selection = selections[entrantId]?.[candidate.personId];
                    if (!selection) return null;
                    return (
                      <li key={candidate.personId} style={rowStyle}>
                        <label style={checkboxLabelStyle}>
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
                          disabled={!selection.included}
                          onChange={(event) =>
                            updateSelection(entrantId, candidate.personId, {
                              number: event.target.value,
                            })
                          }
                          style={numberInputStyle}
                          value={selection.number}
                        />
                        <label style={checkboxLabelStyle}>
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
                          <span style={roleRowStyle}>
                            {projection.rosterRoles.map((role) => (
                              <label key={role.code} style={checkboxLabelStyle}>
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
          );
        })}
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataSegmentsHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.loadMatchDataSegmentsHeading} />
        </h2>
        <ul style={listStyle}>
          {segments.map((row, index) => (
            <li key={row.key} style={rowStyle}>
              <strong>{index + 1}</strong>
              <label style={labelStyle}>
                <FormattedMessage {...messages.loadMatchDataSegmentType} />
                <input
                  aria-label={intl.formatMessage(messages.loadMatchDataSegmentType)}
                  onChange={(event) => updateSegment(row.key, { type: event.target.value })}
                  placeholder={intl.formatMessage(messages.loadMatchDataSegmentTypePlaceholder)}
                  style={inputStyle}
                  value={row.type}
                />
              </label>
              <label style={labelStyle}>
                <FormattedMessage {...messages.loadMatchDataSegmentElapsedSeconds} />
                <input
                  aria-label={intl.formatMessage(messages.loadMatchDataSegmentElapsedSeconds)}
                  min="0"
                  onChange={(event) =>
                    updateSegment(row.key, { elapsedSeconds: event.target.value })
                  }
                  style={inputStyle}
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
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataEventsHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.loadMatchDataEventsHeading} />
        </h2>
        {events.length === 0 && (
          <p style={mutedStyle}>{intl.formatMessage(messages.loadMatchDataNoEvents)}</p>
        )}
        <ol style={listStyle}>
          {events.map((row, index) => (
            <li
              key={row.key}
              className="cl-card cl-chamfer cl-chamfer--control"
              style={eventRowStyle}
            >
              <div style={eventGridStyle}>
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventDefinition} />
                  <select
                    aria-label={intl.formatMessage(messages.loadMatchDataEventDefinition)}
                    onChange={(event) =>
                      updateEvent(row.key, { definitionCode: event.target.value })
                    }
                    style={inputStyle}
                    value={row.definitionCode}
                  >
                    {projection.eventDefinitions.map((definition: ConsoleEventDefinition) => (
                      <option key={definition.code} value={definition.code}>
                        {resolveLabel(definition.label, language)}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventSegment} />
                  <select
                    aria-label={intl.formatMessage(messages.loadMatchDataEventSegment)}
                    onChange={(event) =>
                      updateEvent(row.key, { segmentNumber: event.target.value })
                    }
                    style={inputStyle}
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
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventOccurredAt} />
                  <input
                    aria-label={intl.formatMessage(messages.loadMatchDataEventOccurredAt)}
                    onChange={(event) => updateEvent(row.key, { occurredAt: event.target.value })}
                    style={inputStyle}
                    type="datetime-local"
                    value={row.occurredAt}
                  />
                </label>
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventSide} />
                  <select
                    aria-label={intl.formatMessage(messages.loadMatchDataEventSide)}
                    onChange={(event) => updateEvent(row.key, { side: event.target.value })}
                    style={inputStyle}
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
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventPerson} />
                  <select
                    aria-label={intl.formatMessage(messages.loadMatchDataEventPerson)}
                    onChange={(event) => updateEvent(row.key, { personId: event.target.value })}
                    style={inputStyle}
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
                <label style={labelStyle}>
                  <FormattedMessage {...messages.loadMatchDataEventNotes} />
                  <input
                    aria-label={intl.formatMessage(messages.loadMatchDataEventNotes)}
                    onChange={(event) => updateEvent(row.key, { notes: event.target.value })}
                    style={inputStyle}
                    value={row.notes}
                  />
                </label>
              </div>
              <div style={eventActionsStyle}>
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
      </section>

      <section aria-label={intl.formatMessage(messages.loadMatchDataCsvHeading)} style={panelStyle}>
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.loadMatchDataCsvHeading} />
        </h2>
        <p style={mutedStyle}>{intl.formatMessage(messages.loadMatchDataCsvHelp)}</p>
        <div style={eventActionsStyle}>
          <label className="cl-focusable" style={fileLabelStyle}>
            {intl.formatMessage(messages.loadMatchDataCsvChooseFile)}
            <input
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadCsv(file);
                event.target.value = '';
              }}
              style={hiddenFileInputStyle}
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
      </section>

      <section
        aria-label={intl.formatMessage(messages.loadMatchDataResultHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.loadMatchDataResultHeading} />
        </h2>
        <label style={labelStyle}>
          <FormattedMessage {...messages.loadMatchDataWinner} />
          <select
            aria-label={intl.formatMessage(messages.loadMatchDataWinner)}
            onChange={(event) => setWinnerEntrantId(event.target.value)}
            style={inputStyle}
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
        <Button disabled={submitting} onClick={() => void submit()} type="button">
          {submitting
            ? intl.formatMessage(messages.loadMatchDataSubmitting)
            : intl.formatMessage(messages.loadMatchDataSubmit)}
        </Button>
      </section>
    </section>
  );
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

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-5)' };
const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  margin: 0,
};
const titleStyle: React.CSSProperties = {
  margin: 'var(--cl-space-1) 0 0',
  fontFamily: 'var(--cl-font-display)',
};
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
};
const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 var(--cl-space-4)',
  fontFamily: 'var(--cl-font-display)',
};
const editorStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-3)',
  marginBottom: 'var(--cl-space-4)',
};
const entrantHeaderStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: 'var(--cl-font-size-sm)',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const eventRowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-3)',
  padding: 'var(--cl-space-3)',
};
const eventGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 'var(--cl-space-3)',
};
const eventActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-1)',
  fontSize: 'var(--cl-font-size-sm)',
};
const roleRowStyle: React.CSSProperties = { display: 'flex', gap: 'var(--cl-space-2)' };
const numberInputStyle: React.CSSProperties = { width: '4rem' };
const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  color: 'var(--cl-text-secondary)',
};
const inputStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-2)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-base)',
  color: 'inherit',
};
const mutedStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontSize: 'var(--cl-font-size-sm)',
};
const fileLabelStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  padding: 'var(--cl-space-2) var(--cl-space-3)',
  border: '1px solid var(--cl-border-muted)',
  cursor: 'pointer',
};
const hiddenFileInputStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  cursor: 'pointer',
};
