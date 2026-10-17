import { EntrantName } from '../../../components/ui/atoms/EntrantName.js';
import { useCallback, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  type FixtureResponse,
  type OfficialResponse,
  type ScheduleAssignmentDto,
  type ScheduleConflictDto,
  type ScheduleReasonDto,
  type ScheduleReasonPreset,
  type ScheduleDetailResponse,
  type VenueResponse,
} from '../../lib/api-client.js';
import {
  builderGroups,
  pendingReleases,
  type BuilderRow,
  type SeriesContingency,
} from '../../lib/schedule-series.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { Alert } from '../ui/atoms/alert.js';
import {
  ScheduleReasonPrompt,
  type ReasonPromptResult,
} from '../ui/organisms/schedule-reason-prompt.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

export interface DraftAssignment {
  readonly slotId: string;
  readonly officialIds: readonly string[];
  /** Take the match out of the slot it holds when the batch publishes. */
  readonly withdraw?: boolean;
}

/** A match being played, or already played, keeps its time and place: no move, no withdrawal. */
const LOCKED_STATUSES: ReadonlySet<BuilderRow['status']> = new Set(['in-progress', 'finalized']);

const PRESET_LABELS: Record<ScheduleReasonPreset, typeof messages.scheduleReasonOther> = {
  'venue-unavailable': messages.scheduleReasonVenueUnavailable,
  weather: messages.scheduleReasonWeather,
  'entrant-request': messages.scheduleReasonEntrantRequest,
  'officials-unavailable': messages.scheduleReasonOfficialsUnavailable,
  'prior-match-overran': messages.scheduleReasonPriorMatchOverran,
  broadcast: messages.scheduleReasonBroadcast,
  'data-correction': messages.scheduleReasonDataCorrection,
  other: messages.scheduleReasonOther,
};

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

/** The prompt's reason on the wire: a code only when it is one of the known presets. */
function apiReasonOf(reason: { readonly code?: string; readonly text: string }): ScheduleReasonDto {
  const code = reason.code;
  return code !== undefined && code in PRESET_LABELS
    ? { code: code as ScheduleReasonPreset, text: reason.text }
    : { text: reason.text };
}

function assignmentFrom(
  matchId: string,
  draft: DraftAssignment,
  holdsSlot: boolean,
): ScheduleAssignmentDto | undefined {
  if (draft.withdraw === true) return holdsSlot ? { matchId, withdraw: true } : undefined;
  if (draft.slotId === '') return undefined;
  return {
    matchId,
    slotId: draft.slotId,
    ...(draft.officialIds.length === 0 ? {} : { officialIds: draft.officialIds }),
  };
}

/**
 * Composes the calendar view, the list view, and the preview/publish panel
 * from the data `ScheduleBuilderPage` supplies:
 * every derived computation below (groups, slots, the assignment batch) is
 * a pure read of the page's fixtures/schedules/drafts, and `onPreview`/
 * `onPublish` are the only calls back to the page.
 */
export function ScheduleBuilderTemplate({
  affectedPublishedMatches,
  concurrentNotice,
  committable,
  conflicts,
  currentConflicts = [],
  drafts,
  fixtures,
  freedSlotIds = [],
  officials,
  onPreview,
  onPublish,
  onToggleOfficial,
  onSetDraft,
  organizationAlias,
  placements = {},
  previewed,
  reasonRequiredMatches = [],
  recentReasons = [],
  schedules,
  stageNumber,
  tournamentAlias,
  venues,
}: {
  readonly affectedPublishedMatches: readonly string[];
  readonly concurrentNotice?: string;
  readonly committable: boolean;
  readonly conflicts: readonly ScheduleConflictDto[];
  /**
   * Conflicts among published placements as they stand now. Each was valid when published; one
   * here arose afterwards, typically when a result resolved a side into a clash.
   */
  readonly currentConflicts?: readonly ScheduleConflictDto[];
  readonly drafts: Readonly<Record<string, DraftAssignment>>;
  readonly fixtures: readonly FixtureResponse[];
  /** Slots the previewed batch frees by withdrawing their matches. */
  readonly freedSlotIds?: readonly string[];
  readonly officials: readonly OfficialResponse[];
  readonly onPreview: (batch: readonly ScheduleAssignmentDto[]) => void;
  /** `reason` covers every changed published match its entry does not already cover. */
  readonly onPublish: (batch: readonly ScheduleAssignmentDto[], reason?: ScheduleReasonDto) => void;
  /** Where each match stands on the server now: its slot, as last published. */
  readonly placements?: Readonly<Record<string, string>>;
  /** Published matches the previewed batch changes or withdraws: each needs a reason. */
  readonly reasonRequiredMatches?: readonly string[];
  readonly recentReasons?: readonly string[];
  readonly onSetDraft: (matchId: string, patch: Partial<DraftAssignment>) => void;
  readonly onToggleOfficial: (matchId: string, officialId: string) => void;
  readonly organizationAlias: string;
  readonly previewed: boolean;
  readonly schedules: readonly ScheduleDetailResponse[];
  readonly stageNumber: number;
  readonly tournamentAlias: string;
  readonly venues: readonly VenueResponse[];
}): React.JSX.Element {
  const intl = useIntl();
  const [promptOpen, setPromptOpen] = useState(false);

  const draftFor = useCallback(
    (matchId: string): DraftAssignment => drafts[matchId] ?? EMPTY_DRAFT,
    [drafts],
  );

  const groups = useMemo(() => builderGroups(fixtures), [fixtures]);

  const entrantNames = useMemo(() => {
    const names = new Map<string, { fullName: string; abbreviation?: string }>();
    for (const fixture of fixtures) {
      if (fixture.homeEntrantId !== undefined && fixture.homeName !== undefined)
        names.set(fixture.homeEntrantId, {
          fullName: fixture.homeName,
          abbreviation: fixture.homeAbbreviation,
        });
      if (fixture.awayEntrantId !== undefined && fixture.awayName !== undefined)
        names.set(fixture.awayEntrantId, {
          fullName: fixture.awayName,
          abbreviation: fixture.awayAbbreviation,
        });
    }
    return names;
  }, [fixtures]);
  const unknownName = intl.formatMessage(messages.matchesViewResultStateTbd);

  const allSlots = useMemo(() => {
    return schedules.flatMap((s) =>
      s.slots.map((slot) => ({ ...slot, slotMinutes: s.slotMinutes })),
    );
  }, [schedules]);

  const slotById = useMemo(() => {
    return new Map(allSlots.map((slot) => [slot.slotId, slot]));
  }, [allSlots]);

  // An anulled game is left out of the batch entirely. Publishing an assignment for a match
  // the engine has already recorded as never-to-be-played is refused server-side, and offering
  // it here would only turn a settled fact into a failed publish.
  const batch = useMemo(
    () =>
      groups
        .flatMap((group) => group.rows)
        .filter((row) => row.status !== 'not-required' && !LOCKED_STATUSES.has(row.status))
        .map((row) =>
          assignmentFrom(row.matchId, draftFor(row.matchId), placements[row.matchId] !== undefined),
        )
        .filter((assignment): assignment is ScheduleAssignmentDto => assignment !== undefined),
    [groups, draftFor, placements],
  );

  const rowLabelOf = useMemo(() => {
    const labels = new Map<string, string>();
    for (const group of groups) {
      const cross = `${entrantNames.get(group.homeEntrantId ?? '')?.fullName ?? unknownName} vs ${entrantNames.get(group.awayEntrantId ?? '')?.fullName ?? unknownName}`;
      for (const row of group.rows) {
        labels.set(
          row.matchId,
          group.series
            ? `${cross} — ${intl.formatMessage(messages.scheduleBuilderSeriesGame, {
                number: row.number,
                span: group.series.span,
              })}`
            : cross,
        );
      }
    }
    return labels;
  }, [groups, intl, entrantNames, unknownName]);

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

  const promptRows = reasonRequiredMatches.map((matchId) => {
    const from =
      describeSlot(placements[matchId]) ?? intl.formatMessage(messages.scheduleBuilderUnassigned);
    const draft = draftFor(matchId);
    return {
      matchId,
      label: rowLabelOf.get(matchId) ?? unknownName,
      change:
        draft.withdraw === true
          ? intl.formatMessage(messages.reasonPromptWithdrawnChange, { from })
          : intl.formatMessage(messages.reasonPromptChange, {
              from,
              to:
                describeSlot(draft.slotId) ??
                intl.formatMessage(messages.scheduleBuilderUnassigned),
            }),
    };
  });

  /**
   * A conflict in the operator's language, from its kind, its matches and the resource involved.
   * The API's `detail` is an English diagnostic carrying identifiers and is never shown.
   */
  function describeConflict(conflict: ScheduleConflictDto): string {
    const nameOf = (matchId: string) =>
      rowLabelOf.get(matchId) ?? intl.formatMessage(messages.scheduleBuilderOtherMatch);
    const values = {
      match: nameOf(conflict.matchId),
      other: nameOf(conflict.conflictsWithMatchId),
    };
    switch (conflict.kind) {
      case 'rest-rule':
        return intl.formatMessage(messages.scheduleBuilderConflictRest, {
          ...values,
          entrant: entrantNames.get(conflict.resourceId)?.fullName ?? unknownName,
        });
      case 'official-double-booked':
        return intl.formatMessage(messages.scheduleBuilderConflictOfficial, values);
      case 'match-finalized':
        return intl.formatMessage(messages.scheduleBuilderConflictFinalized, values);
      case 'match-in-progress':
        return intl.formatMessage(messages.scheduleBuilderConflictInProgress, values);
      default:
        return intl.formatMessage(messages.scheduleBuilderConflictVenue, values);
    }
  }

  /** A batch moving published matches asks why first; first placements publish directly. */
  function requestPublish(): void {
    if (reasonRequiredMatches.length > 0) setPromptOpen(true);
    else onPublish(batch);
  }

  function publishWithReasons(result: ReasonPromptResult): void {
    setPromptOpen(false);
    onPublish(
      batch.map((entry) => {
        const own = result.exceptions[entry.matchId];
        return own === undefined ? entry : { ...entry, reason: apiReasonOf(own) };
      }),
      result.batch === undefined ? undefined : apiReasonOf(result.batch),
    );
  }

  /** The cross a series' rows are grouped under, so five rows never read as five matches. */
  function crossLabel(group: (typeof groups)[number]): string {
    return `${entrantNames.get(group.homeEntrantId ?? '')?.fullName ?? unknownName} vs ${entrantNames.get(group.awayEntrantId ?? '')?.fullName ?? unknownName}`;
  }

  function entrantNode(entrantId: string | undefined): React.JSX.Element {
    const identity = entrantNames.get(entrantId ?? '');
    return (
      <EntrantName
        inline
        fullName={identity?.fullName ?? unknownName}
        abbreviation={identity?.abbreviation}
      />
    );
  }

  function crossNode(group: (typeof groups)[number]): React.JSX.Element {
    return (
      <>
        {entrantNode(group.homeEntrantId)}
        {' vs '}
        {entrantNode(group.awayEntrantId)}
      </>
    );
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

  const stageHubHref = `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}`;
  const breadcrumbNode = (
    <span>
      {organizationAlias} / {tournamentAlias} /{' '}
      <a className="cl-focusable" href={stageHubHref} onClick={controlLinkClick(stageHubHref)}>
        <FormattedMessage {...messages.stageHubBreadcrumbLink} values={{ stageNumber }} />
      </a>
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
    <div className="cl-screen-sections">
      {concurrentNotice && <Alert tone="warning">{concurrentNotice}</Alert>}
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
                    {crossNode(group)}
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
                      // A withdrawal shows as unscheduled before it publishes, freeing its slot.
                      const assignedSlot =
                        draft.withdraw === true ? undefined : slotById.get(draft.slotId);
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
                              crossNode(group)
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
                  <h3 className="cl-card__title">{crossNode(group)}</h3>
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
                    // A live or played match keeps its time and place: the record is not a plan.
                    if (LOCKED_STATUSES.has(row.status)) {
                      return (
                        <p key={row.matchId} className="cl-card__description">
                          {rowLabel} —{' '}
                          <FormattedMessage
                            {...(row.status === 'in-progress'
                              ? messages.scheduleBuilderLiveLocked
                              : messages.scheduleBuilderConcludedLocked)}
                          />
                        </p>
                      );
                    }
                    if (draft.withdraw === true) {
                      return (
                        <div key={row.matchId} className="cl-schedule-builder__assignment-row">
                          <p className="cl-card__description">
                            {rowLabel} — <FormattedMessage {...messages.scheduleBuilderWithdrawn} />
                          </p>
                          <Button
                            onClick={() => onSetDraft(row.matchId, { withdraw: false })}
                            type="button"
                            variant="secondary"
                          >
                            <FormattedMessage {...messages.scheduleBuilderKeepPlacement} />
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <div key={row.matchId} className="cl-schedule-builder__assignment-row">
                        <Field
                          id={`slot-${row.matchId}`}
                          label={intl.formatMessage(messages.scheduleBuilderStartTime)}
                        >
                          <Select
                            aria-label={`${intl.formatMessage(messages.scheduleBuilderStartTime)} — ${rowLabel}`}
                            id={`slot-${row.matchId}`}
                            onValueChange={(val) => onSetDraft(row.matchId, { slotId: val })}
                            options={[
                              {
                                value: '',
                                label: intl.formatMessage(messages.scheduleBuilderUnassigned),
                              },
                              ...allSlots.map((slot) => {
                                const venue = venues.find((v) => v.venueId === slot.venueId);
                                const isOccupied =
                                  slot.matchCount >= (venue?.concurrentCapacity ?? 1) &&
                                  draft.slotId !== slot.slotId;
                                return {
                                  value: slot.slotId,
                                  label: `${new Date(slot.startsAt).toISOString().slice(0, 16)}${venue ? ` @ ${venue.name}` : ''} (${slot.matchCount}/${venue?.concurrentCapacity ?? 1})${isOccupied ? ' (Full)' : ''}`,
                                  disabled: isOccupied,
                                };
                              }),
                            ]}
                            value={draft.slotId}
                          />
                        </Field>

                        {contingencyNode(row)}

                        {placements[row.matchId] !== undefined && (
                          <Button
                            aria-label={`${intl.formatMessage(messages.scheduleBuilderWithdraw)} — ${rowLabel}`}
                            onClick={() => onSetDraft(row.matchId, { withdraw: true })}
                            type="button"
                            variant="secondary"
                          >
                            <FormattedMessage {...messages.scheduleBuilderWithdraw} />
                          </Button>
                        )}

                        <fieldset className="cl-role-user">
                          <legend className="cl-label">
                            <FormattedMessage {...messages.scheduleBuilderOfficials} />
                          </legend>
                          {officials.map((official) => (
                            <label key={official.officialId} className="cl-toggle cl-focusable">
                              <Checkbox
                                checked={draft.officialIds.includes(official.officialId)}
                                onCheckedChange={() =>
                                  onToggleOfficial(row.matchId, official.officialId)
                                }
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
                    {entrantNode(entrantId)} —{' '}
                    <FormattedMessage {...messages.scheduleBuilderDayOff} />
                  </p>
                ))}
            </div>
          </Card>

          <Card className="cl-chamfer cl-chamfer--control">
            <header className="cl-card__header">
              <div className="cl-role-user">
                <Button
                  disabled={batch.length === 0}
                  onClick={() => onPreview(batch)}
                  type="button"
                >
                  <FormattedMessage {...messages.scheduleBuilderPreview} />
                </Button>
                <Button
                  disabled={!previewed || !committable || batch.length === 0}
                  onClick={requestPublish}
                  type="button"
                >
                  <FormattedMessage {...messages.scheduleBuilderPublish} />
                </Button>
              </div>
            </header>

            <div className="cl-card__content">
              {currentConflicts.length > 0 && (
                <div data-arisen-conflicts="" role="status">
                  <h3 className="cl-card__title">
                    <FormattedMessage {...messages.scheduleBuilderArisenHeading} />
                  </h3>
                  <p className="cl-card__description">
                    <FormattedMessage {...messages.scheduleBuilderArisenDescription} />
                  </p>
                  <ul>
                    {currentConflicts.map((conflict) => (
                      <li
                        key={`${conflict.kind}:${conflict.matchId}:${conflict.conflictsWithMatchId}:${conflict.resourceId}`}
                      >
                        {describeConflict(conflict)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {conflicts.length > 0 && (
                <div role="alert">
                  <h3 className="cl-card__title">
                    <FormattedMessage {...messages.scheduleBuilderConflictsHeading} />
                  </h3>
                  <ul>
                    {conflicts.map((conflict, index) => (
                      <li key={index}>{describeConflict(conflict)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewed && affectedPublishedMatches.length > 0 && (
                <Alert tone="live">
                  <FormattedMessage {...messages.scheduleBuilderAffectedPublishedHeading} />
                </Alert>
              )}

              {previewed && freedSlotIds.length > 0 && (
                <div>
                  <h3 className="cl-card__title">
                    <FormattedMessage {...messages.scheduleBuilderFreedSlotsHeading} />
                  </h3>
                  <ul>
                    {freedSlotIds.map((slotId) => (
                      <li key={slotId}>{describeSlot(slotId) ?? slotId}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <ScheduleReasonPrompt
            onOpenChange={setPromptOpen}
            onPublish={publishWithReasons}
            open={promptOpen}
            presets={(Object.keys(PRESET_LABELS) as ScheduleReasonPreset[]).map((code) => ({
              code,
              label: intl.formatMessage(PRESET_LABELS[code]),
            }))}
            recent={recentReasons}
            rows={promptRows}
          />
        </>
      )}
    </div>
  );

  return (
    <ListScreenLayout
      breadcrumb={breadcrumbNode}
      listing={listingNode}
      title={titleNode}
      toolbar={toolbarNode}
    />
  );
}
