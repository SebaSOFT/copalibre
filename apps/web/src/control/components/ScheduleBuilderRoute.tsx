import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type FixtureResponse,
  type OfficialResponse,
  type ScheduleAssignmentDto,
  type ScheduleConflictDto,
  type ScheduleDetailResponse,
  type VenueResponse,
} from '../lib/api-client.js';
import {
  builderGroups,
  pendingReleases,
  type BuilderRow,
  type SeriesContingency,
} from '../lib/schedule-series.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { FormField } from './ui/molecules/form-field.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

interface DraftAssignment {
  readonly slotId: string;
  readonly officialIds: readonly string[];
}

const EMPTY_DRAFT: DraftAssignment = {
  slotId: '',
  officialIds: [],
};

const CONTINGENCY_LABELS: Record<
  SeriesContingency,
  typeof messages.scheduleBuilderContingencyCertain
> = {
  certain: messages.scheduleBuilderContingencyCertain,
  contingent: messages.scheduleBuilderContingencyContingent,
  'no-longer-required': messages.scheduleBuilderContingencyNotRequired,
};

/**
 * The schedule builder: a calendar view and a list view over one
 * stage's fixtures, both driving the same manual assignment batch the
 * accepted `tournament-engine/resource-scheduling` API accepts at match/slot grain —
 * build, preview (showing conflicts and downstream-affected published
 * matches exactly as the API reports them), then explicitly publish.
 *
 * Placement is at match grain, not fixture grain: a fixture declaring a best-of-five
 * presents five rows, each with its own slot and officials, grouped under the cross they
 * settle. A fixture declaring no series presents the one row it always has.
 */
export function ScheduleBuilderRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
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

  const [stageId, setStageId] = useState<string | undefined>(undefined);
  const [fixtures, setFixtures] = useState<readonly FixtureResponse[]>([]);
  const [venues, setVenues] = useState<readonly VenueResponse[]>([]);
  const [officials, setOfficials] = useState<readonly OfficialResponse[]>([]);
  const [schedules, setSchedules] = useState<readonly ScheduleDetailResponse[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, DraftAssignment>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [conflicts, setConflicts] = useState<readonly ScheduleConflictDto[]>([]);
  const [affectedPublishedMatches, setAffectedPublishedMatches] = useState<readonly string[]>([]);
  const [committable, setCommittable] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  // Keyed by match, not by fixture: a series' five games each hold their own slot and their
  // own officials, so a fixture-keyed draft could only ever place one of them.
  const draftFor = useCallback(
    (matchId: string): DraftAssignment => drafts[matchId] ?? EMPTY_DRAFT,
    [drafts],
  );

  const groups = useMemo(() => builderGroups(fixtures), [fixtures]);

  const allSlots = useMemo(() => {
    return schedules.flatMap((s) =>
      s.slots.map((slot) => ({ ...slot, slotMinutes: s.slotMinutes })),
    );
  }, [schedules]);

  const slotById = useMemo(() => {
    return new Map(allSlots.map((slot) => [slot.slotId, slot]));
  }, [allSlots]);

  function assignmentFrom(
    matchId: string,
    draft: DraftAssignment,
  ): ScheduleAssignmentDto | undefined {
    if (draft.slotId === '') return undefined;
    return {
      matchId,
      slotId: draft.slotId,
      ...(draft.officialIds.length === 0 ? {} : { officialIds: draft.officialIds }),
    };
  }

  // An anulled game is left out of the batch entirely. Publishing an assignment for a match
  // the engine has already recorded as never-to-be-played is refused server-side, and offering
  // it here would only turn a settled fact into a failed publish.
  const batch = useMemo(
    () =>
      groups
        .flatMap((group) => group.rows)
        .filter((row) => row.status !== 'not-required')
        .map((row) => assignmentFrom(row.matchId, draftFor(row.matchId)))
        .filter((assignment): assignment is ScheduleAssignmentDto => assignment !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignmentFrom is a pure local helper, not a dep
    [groups, drafts, draftFor],
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [fixturesResponse, loadedVenues, loadedOfficials, loadedSchedules] = await Promise.all([
        api.getStageFixtures?.(organizationAlias, tournamentAlias, stageNumber),
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
        api.listSchedules?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      if (!fixturesResponse) throw new Error('no fixtures client configured');
      setStageId(fixturesResponse.stageId);
      setFixtures(fixturesResponse.fixtures);
      setVenues(loadedVenues);
      setOfficials(loadedOfficials);
      setSchedules(loadedSchedules);

      const schedule = await api.getSchedule?.(
        organizationAlias,
        tournamentAlias,
        fixturesResponse.stageId,
      );
      const nextDrafts: Record<string, DraftAssignment> = {};
      for (const assignment of schedule?.assignments ?? []) {
        nextDrafts[assignment.matchId] = {
          slotId: assignment.slotId,
          officialIds: assignment.officialIds ?? [],
        };
      }
      setDrafts(nextDrafts);
      setPreviewed(false);
      setConflicts([]);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.scheduleBuilderLoadFailed));
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber, intl]);

  useEffect(() => {
    void Promise.resolve().then(() => reload());
  }, [reload]);

  function setDraft(matchId: string, patch: Partial<DraftAssignment>): void {
    setDrafts((current) => ({
      ...current,
      [matchId]: { ...(current[matchId] ?? EMPTY_DRAFT), ...patch },
    }));
    setPreviewed(false);
  }

  async function preview(): Promise<void> {
    if (!api.previewSchedule || stageId === undefined || batch.length === 0) return;
    try {
      const result = await api.previewSchedule(organizationAlias, tournamentAlias, stageId, {
        assignments: batch,
      });
      setConflicts(result.conflicts);
      setAffectedPublishedMatches(result.affectedPublishedMatches);
      setCommittable(result.committable);
      setPreviewed(true);
    } catch (error) {
      pushError(error);
    }
  }

  async function publish(): Promise<void> {
    if (!api.publishSchedule || stageId === undefined || batch.length === 0) return;
    try {
      await api.publishSchedule(organizationAlias, tournamentAlias, stageId, {
        assignments: batch,
      });
      push({ severity: 'success', message: intl.formatMessage(messages.scheduleBuilderPublished) });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  function toggleOfficial(matchId: string, officialId: string): void {
    const current = draftFor(matchId).officialIds;
    setDraft(matchId, {
      officialIds: current.includes(officialId)
        ? current.filter((candidate) => candidate !== officialId)
        : [...current, officialId],
    });
  }

  if (loading) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.scheduleBuilderLoading)}</p>;
  }
  if (loadError) {
    return (
      <p className="cl-inline-alert" role="alert">
        {loadError}
      </p>
    );
  }

  const entrantIds = [
    ...new Set(groups.flatMap((group) => [group.homeEntrantId, group.awayEntrantId])),
  ].filter((entrantId): entrantId is string => entrantId !== undefined);
  const scheduledEntrantIds = new Set(
    groups
      .filter((group) => group.rows.some((row) => draftFor(row.matchId).slotId !== ''))
      .flatMap((group) => [group.homeEntrantId, group.awayEntrantId]),
  );

  /** A slot as an operator reads it: when, where, how long. */
  function describeSlot(slotId: string | undefined): string | undefined {
    if (slotId === undefined || slotId === '') return undefined;
    const slot = slotById.get(slotId);
    if (!slot) return undefined;
    const venue = venues.find((candidate) => candidate.venueId === slot.venueId);
    return `${new Date(slot.startsAt).toISOString().slice(0, 16)}${venue ? ` @ ${venue.name}` : ''}`;
  }

  const releases = pendingReleases(groups, (matchId) => draftFor(matchId).slotId);

  /** The cross a series' rows are grouped under, so five rows never read as five matches. */
  function crossLabel(group: (typeof groups)[number]): string {
    return `${group.homeEntrantId ?? '—'} vs ${group.awayEntrantId ?? '—'}`;
  }

  /**
   * Every row states its contingency in words. A row belonging to no series says nothing —
   * there is nothing contingent about a single match, and inventing a "will be played" badge
   * for one would be noise.
   */
  function contingencyNode(row: BuilderRow): React.JSX.Element | undefined {
    if (row.contingency === undefined) return undefined;
    return (
      <span className="cl-card__description">
        <FormattedMessage {...CONTINGENCY_LABELS[row.contingency]} />
      </span>
    );
  }

  const breadcrumbNode = (
    <span>
      {organizationAlias} / {tournamentAlias} / Stage {stageNumber}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.scheduleBuilderTitle} />;

  const matchesViewHref = `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches-view?stageNumber=${stageNumber}`;

  const toolbarNode = (
    <>
      <a
        className="cl-focusable"
        href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/standings`}
        onClick={controlLinkClick(
          `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/standings`,
        )}
      >
        <FormattedMessage {...messages.standingsTitle} />
      </a>
      <a
        className="cl-focusable"
        href={matchesViewHref}
        onClick={controlLinkClick(matchesViewHref)}
      >
        <FormattedMessage {...messages.matchesViewSeeAll} />
      </a>
    </>
  );

  const listingNode = (
    <div className="cl-platform-sections">
      {fixtures.length === 0 && (
        <p className="cl-card__description">
          <FormattedMessage {...messages.scheduleBuilderNoFixtures} />
        </p>
      )}

      {fixtures.length > 0 && (
        <>
          <Card
            aria-label={intl.formatMessage(messages.scheduleBuilderCalendarViewLabel)}
            className="cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.scheduleBuilderCalendarViewLabel} />
              </h2>
            </header>
            <div className="cl-card__content">
              {groups.map((group) => (
                <section key={group.fixtureId} aria-label={crossLabel(group)}>
                  <h3 className="cl-card__title">
                    <FormattedMessage
                      {...messages.scheduleBuilderFixtureRound}
                      values={{ round: group.round }}
                    />
                    {' — '}
                    {crossLabel(group)}
                  </h3>
                  {group.series && (
                    <p className="cl-card__description">
                      <FormattedMessage
                        {...messages.scheduleBuilderSeriesHeading}
                        values={{
                          span: group.series.span,
                          played: group.series.matchesPlayed,
                        }}
                      />
                      {group.series.explanation !== undefined && ` — ${group.series.explanation}`}
                    </p>
                  )}
                  <ul>
                    {group.rows.map((row) => {
                      const draft = draftFor(row.matchId);
                      const assignedSlot = slotById.get(draft.slotId);
                      const venue = assignedSlot
                        ? venues.find((c) => c.venueId === assignedSlot.venueId)
                        : undefined;
                      const assignedOfficials = officials.filter((candidate) =>
                        draft.officialIds.includes(candidate.officialId),
                      );
                      const releasedSlot = describeSlot(row.releasedSlotId);
                      return (
                        <li key={row.matchId} className="cl-role-user">
                          <span>
                            {group.series ? (
                              <FormattedMessage
                                {...messages.scheduleBuilderSeriesGame}
                                values={{ number: row.number, span: group.series.span }}
                              />
                            ) : (
                              crossLabel(group)
                            )}
                          </span>
                          {contingencyNode(row)}
                          <span>
                            {assignedSlot ? (
                              <>
                                {new Date(assignedSlot.startsAt).toISOString().slice(0, 16)}
                                {assignedSlot.slotMinutes && ` (${assignedSlot.slotMinutes}m)`}
                                {venue && ` @ ${venue.name}`}
                                {assignedOfficials.length > 0 &&
                                  ` · ${assignedOfficials.map((candidate) => candidate.displayName).join(', ')}`}
                              </>
                            ) : (
                              intl.formatMessage(messages.scheduleBuilderUnassigned)
                            )}
                          </span>
                          {/* An anulled game keeps its place in the view and names the slot it
                              had held, so an organizer knows the venue and hour came back. */}
                          {row.status === 'not-required' && (
                            <span className="cl-card__description">
                              {releasedSlot === undefined ? (
                                <FormattedMessage
                                  {...messages.scheduleBuilderReleasedSlotUnknown}
                                />
                              ) : (
                                <FormattedMessage
                                  {...messages.scheduleBuilderReleasedSlot}
                                  values={{ slot: releasedSlot }}
                                />
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <Card
            aria-label={intl.formatMessage(messages.scheduleBuilderListViewLabel)}
            className="cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.scheduleBuilderListViewLabel} />
              </h2>
            </header>
            <div className="cl-card__content">
              {groups.map((group) => (
                <section key={group.fixtureId} aria-label={crossLabel(group)}>
                  <h3 className="cl-card__title">{crossLabel(group)}</h3>
                  {group.series && (
                    <p className="cl-card__description">
                      <FormattedMessage
                        {...messages.scheduleBuilderSeriesHeading}
                        values={{ span: group.series.span, played: group.series.matchesPlayed }}
                      />
                    </p>
                  )}
                  {group.rows.map((row) => {
                    const draft = draftFor(row.matchId);
                    // Names the cross as well as the game: two crosses each have a game
                    // four, and a control labelled only "Game 4 of 5" tells a screen-reader
                    // user which game but not whose.
                    const rowLabel = group.series
                      ? `${crossLabel(group)} — ${intl.formatMessage(
                          messages.scheduleBuilderSeriesGame,
                          { number: row.number, span: group.series.span },
                        )}`
                      : crossLabel(group);
                    // An anulled game holds no slot and cannot be given one: the record says
                    // it was never played, and a schedule entry would contradict that.
                    if (row.status === 'not-required') {
                      const releasedSlot = describeSlot(row.releasedSlotId);
                      return (
                        <p key={row.matchId} className="cl-card__description">
                          {rowLabel} —{' '}
                          <FormattedMessage {...CONTINGENCY_LABELS['no-longer-required']} />{' '}
                          {releasedSlot === undefined ? (
                            <FormattedMessage {...messages.scheduleBuilderReleasedSlotUnknown} />
                          ) : (
                            <FormattedMessage
                              {...messages.scheduleBuilderReleasedSlot}
                              values={{ slot: releasedSlot }}
                            />
                          )}
                        </p>
                      );
                    }
                    return (
                      <div key={row.matchId} className="cl-platform-form-grid">
                        <FormField
                          id={`slot-${row.matchId}`}
                          label={intl.formatMessage(messages.scheduleBuilderStartTime)}
                        >
                          <select
                            aria-label={`${intl.formatMessage(messages.scheduleBuilderStartTime)} — ${rowLabel}`}
                            className="cl-select cl-select--default cl-focusable"
                            id={`slot-${row.matchId}`}
                            onChange={(event) =>
                              setDraft(row.matchId, { slotId: event.target.value })
                            }
                            value={draft.slotId}
                          >
                            <option value="">
                              {intl.formatMessage(messages.scheduleBuilderUnassigned)}
                            </option>
                            {allSlots.map((slot) => {
                              const venue = venues.find((v) => v.venueId === slot.venueId);
                              const isOccupied =
                                slot.matchCount >= (venue?.concurrentCapacity ?? 1) &&
                                draft.slotId !== slot.slotId;
                              return (
                                <option key={slot.slotId} disabled={isOccupied} value={slot.slotId}>
                                  {new Date(slot.startsAt).toISOString().slice(0, 16)}
                                  {venue ? ` @ ${venue.name}` : ''}
                                  {` (${slot.matchCount}/${venue?.concurrentCapacity ?? 1})`}
                                  {isOccupied ? ' (Full)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </FormField>

                        {contingencyNode(row)}

                        <fieldset className="cl-role-user">
                          <legend className="cl-label">
                            <FormattedMessage {...messages.scheduleBuilderOfficials} />
                          </legend>
                          {officials.map((official) => (
                            <label key={official.officialId} className="cl-toggle cl-focusable">
                              <input
                                checked={draft.officialIds.includes(official.officialId)}
                                className="cl-checkbox cl-focusable"
                                onChange={() => toggleOfficial(row.matchId, official.officialId)}
                                type="checkbox"
                              />
                              <span>{official.displayName}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>
                    );
                  })}
                </section>
              ))}

              {/* Which slots a decision is about to hand back, named before it is committed —
                  an hour of venue an organizer can only give away if they know it is coming. */}
              {releases.length > 0 && (
                <div>
                  <h3 className="cl-card__title">
                    <FormattedMessage {...messages.scheduleBuilderPendingReleasesHeading} />
                  </h3>
                  <ul>
                    {releases.map((release) => (
                      <li key={release.matchId}>
                        <FormattedMessage
                          {...messages.scheduleBuilderPendingRelease}
                          values={{
                            number: release.number,
                            slot:
                              describeSlot(release.slotId) ??
                              intl.formatMessage(messages.scheduleBuilderUnassigned),
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entrantIds
                .filter((entrantId) => !scheduledEntrantIds.has(entrantId))
                .map((entrantId) => (
                  <p key={entrantId} className="cl-card__description">
                    {entrantId} — <FormattedMessage {...messages.scheduleBuilderDayOff} />
                  </p>
                ))}
            </div>
          </Card>

          <Card className="cl-chamfer cl-chamfer--control">
            <header className="cl-card__header">
              <div className="cl-role-user">
                <Button disabled={batch.length === 0} onClick={() => void preview()} type="button">
                  <FormattedMessage {...messages.scheduleBuilderPreview} />
                </Button>
                <Button
                  disabled={!previewed || !committable || batch.length === 0}
                  onClick={() => void publish()}
                  type="button"
                >
                  <FormattedMessage {...messages.scheduleBuilderPublish} />
                </Button>
              </div>
            </header>

            <div className="cl-card__content">
              {conflicts.length > 0 && (
                <div role="alert">
                  <h3 className="cl-card__title">
                    <FormattedMessage {...messages.scheduleBuilderConflictsHeading} />
                  </h3>
                  <ul>
                    {conflicts.map((conflict, index) => (
                      <li key={index}>{conflict.detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewed && affectedPublishedMatches.length > 0 && (
                <p className="cl-inline-alert" role="alert">
                  <FormattedMessage {...messages.scheduleBuilderAffectedPublishedHeading} />
                </p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );

  return (
    <ListScreenTemplate
      breadcrumb={breadcrumbNode}
      listing={listingNode}
      title={titleNode}
      toolbar={toolbarNode}
    />
  );
}
