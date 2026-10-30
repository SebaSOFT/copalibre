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
import { formatDateTime } from '../../lib/presentation-formatting.js';

export interface DraftAssignment {
  readonly slotId: string;
  readonly officialIds: readonly string[];
  /** Take the match out of the slot it holds when the batch publishes. */
  readonly withdraw?: boolean;
}

/** A match being played, or already played, keeps its time and place: no move, no withdrawal. */
const LOCKED_STATUSES: ReadonlySet<BuilderRow['status']> = new Set(['in-progress', 'finalized']);
const UNASSIGNED_DAY_KEY = 'unassigned';
const NO_VENUE_KEY = 'no-venue';

interface ScheduleDisplayRow {
  readonly row: BuilderRow;
  readonly label: string;
  readonly slot?: ScheduleDetailResponse['slots'][number];
  readonly dayKey: string;
  readonly dayLabel: string;
  readonly venueKey: string;
  readonly venueLabel: string;
}

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
 * Composes the day-grouped schedule and preview/publish panel from the data
 * `ScheduleBuilderPage` supplies:
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
  organizationTimeZone,
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
  readonly organizationTimeZone?: string;
  readonly previewed: boolean;
  readonly schedules: readonly ScheduleDetailResponse[];
  readonly stageNumber: number;
  readonly tournamentAlias: string;
  readonly venues: readonly VenueResponse[];
}): React.JSX.Element {
  const intl = useIntl();
  const [promptOpen, setPromptOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('all');
  const [selectedVenue, setSelectedVenue] = useState('all');

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
  const publishHint =
    batch.length === 0
      ? messages.scheduleBuilderAssignBeforePreview
      : !previewed
        ? messages.scheduleBuilderPreviewBeforePublish
        : !committable
          ? messages.scheduleBuilderResolveConflictsBeforePublish
          : undefined;

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
    return `${formatDateTime(intl, slot.startsAt, organizationTimeZone)}${venue ? ` @ ${venue.name}` : ''}`;
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

  const scheduleRows = useMemo(() => {
    const timeZone = organizationTimeZone === undefined ? {} : { timeZone: organizationTimeZone };
    const dayKeyFormatter = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...timeZone,
    });
    const dayLabelFormatter = new Intl.DateTimeFormat(intl.locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...timeZone,
    });
    const collator = new Intl.Collator(intl.locale);

    return groups
      .flatMap((group) =>
        group.rows.map((row): ScheduleDisplayRow => {
          const draft = draftFor(row.matchId);
          const slotId =
            draft.withdraw === true ? undefined : draft.slotId || row.releasedSlotId || undefined;
          const slot = slotId === undefined ? undefined : slotById.get(slotId);
          const venue = slot && venues.find((candidate) => candidate.venueId === slot.venueId);
          const dayParts = slot
            ? dayKeyFormatter.formatToParts(new Date(slot.startsAt))
            : undefined;
          const datePart = (type: 'year' | 'month' | 'day') =>
            dayParts?.find((part) => part.type === type)?.value ?? '';
          const dayKey =
            dayParts === undefined
              ? UNASSIGNED_DAY_KEY
              : `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
          const dayLabel = slot
            ? dayLabelFormatter.format(new Date(slot.startsAt))
            : intl.formatMessage(messages.scheduleBuilderUnassigned);
          const cross = `${entrantNames.get(group.homeEntrantId ?? '')?.fullName ?? unknownName} vs ${entrantNames.get(group.awayEntrantId ?? '')?.fullName ?? unknownName}`;
          const label = group.series
            ? `${cross} — ${intl.formatMessage(messages.scheduleBuilderSeriesGame, {
                number: row.number,
                span: group.series.span,
              })}`
            : cross;

          return {
            row,
            label,
            ...(slot === undefined ? {} : { slot }),
            dayKey,
            dayLabel,
            venueKey: venue?.venueId ?? NO_VENUE_KEY,
            venueLabel: venue?.name ?? intl.formatMessage(messages.scheduleBuilderNoVenue),
          };
        }),
      )
      .sort((left, right) => {
        const dayOrder = left.dayKey.localeCompare(right.dayKey);
        if (dayOrder !== 0) return dayOrder;
        if (left.venueKey === NO_VENUE_KEY && right.venueKey !== NO_VENUE_KEY) return 1;
        if (right.venueKey === NO_VENUE_KEY && left.venueKey !== NO_VENUE_KEY) return -1;
        const venueOrder = collator.compare(left.venueLabel, right.venueLabel);
        if (venueOrder !== 0) return venueOrder;
        const timeOrder = (left.slot?.startsAt ?? 0) - (right.slot?.startsAt ?? 0);
        return timeOrder || left.label.localeCompare(right.label, intl.locale);
      });
  }, [groups, draftFor, slotById, venues, organizationTimeZone, intl, entrantNames, unknownName]);

  const dayOptions = [
    ...new Map(scheduleRows.map(({ dayKey, dayLabel }) => [dayKey, dayLabel])).entries(),
  ].map(([value, label]) => ({ value, label }));
  const venueOptions = [
    ...new Map(scheduleRows.map(({ venueKey, venueLabel }) => [venueKey, venueLabel])).entries(),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => {
      if (left.value === NO_VENUE_KEY) return 1;
      if (right.value === NO_VENUE_KEY) return -1;
      return left.label.localeCompare(right.label, intl.locale);
    });

  const visibleRows = scheduleRows.filter(
    ({ dayKey, venueKey }) =>
      (selectedDay === 'all' || selectedDay === dayKey) &&
      (selectedVenue === 'all' || selectedVenue === venueKey),
  );
  const dayGroups = [
    ...new Map(
      visibleRows.map((entry) => [entry.dayKey, { key: entry.dayKey, label: entry.dayLabel }]),
    ).values(),
  ].map((day) => {
    const rows = visibleRows.filter((entry) => entry.dayKey === day.key);
    const venuesForDay = [
      ...new Map(
        rows.map((entry) => [entry.venueKey, { key: entry.venueKey, label: entry.venueLabel }]),
      ).values(),
    ].map((venue) => ({
      ...venue,
      rows: rows.filter((entry) => entry.venueKey === venue.key),
    }));
    return { ...day, venues: venuesForDay };
  });

  function scheduleEntryNode(entry: ScheduleDisplayRow): React.JSX.Element {
    const { row, label, slot } = entry;
    const draft = draftFor(row.matchId);

    if (row.status === 'not-required') {
      const releasedSlot = describeSlot(row.releasedSlotId);
      return (
        <p className="cl-card__description">
          {label} — <FormattedMessage {...CONTINGENCY_LABELS['no-longer-required']} />{' '}
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

    if (LOCKED_STATUSES.has(row.status)) {
      return (
        <p className="cl-card__description">
          {label} — {slot && `${formatDateTime(intl, slot.startsAt, organizationTimeZone)} — `}
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
        <div className="cl-schedule-builder__assignment-row">
          <p className="cl-card__description">
            {label} — <FormattedMessage {...messages.scheduleBuilderWithdrawn} />
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
      <div className="cl-schedule-builder__assignment-row">
        <strong>{label}</strong>
        <Field
          id={`slot-${row.matchId}`}
          label={intl.formatMessage(messages.scheduleBuilderStartTime)}
        >
          <Select
            aria-label={`${intl.formatMessage(messages.scheduleBuilderStartTime)} — ${label}`}
            id={`slot-${row.matchId}`}
            onValueChange={(value) => onSetDraft(row.matchId, { slotId: value })}
            options={[
              {
                value: '',
                label: intl.formatMessage(messages.scheduleBuilderUnassigned),
              },
              ...allSlots.map((candidate) => {
                const venue = venues.find((item) => item.venueId === candidate.venueId);
                const isOccupied =
                  candidate.matchCount >= (venue?.concurrentCapacity ?? 1) &&
                  draft.slotId !== candidate.slotId;
                return {
                  value: candidate.slotId,
                  label: `${formatDateTime(intl, candidate.startsAt, organizationTimeZone)}${venue ? ` @ ${venue.name}` : ''} (${candidate.matchCount}/${venue?.concurrentCapacity ?? 1})${isOccupied ? ' (Full)' : ''}`,
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
            aria-label={`${intl.formatMessage(messages.scheduleBuilderWithdraw)} — ${label}`}
            onClick={() => onSetDraft(row.matchId, { withdraw: true })}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.scheduleBuilderWithdraw} />
          </Button>
        )}

        {officials.length > 0 && (
          <fieldset className="cl-role-user">
            <legend className="cl-label">
              <FormattedMessage {...messages.scheduleBuilderOfficials} />
            </legend>
            {officials.map((official) => (
              <label key={official.officialId} className="cl-toggle cl-focusable">
                <Checkbox
                  checked={draft.officialIds.includes(official.officialId)}
                  onCheckedChange={() => onToggleOfficial(row.matchId, official.officialId)}
                />
                <span>{official.displayName}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
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
    <div className="cl-table-toolbar__filters">
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
    </div>
  );

  const listingNode = (
    <div className="cl-screen-sections">
      {concurrentNotice && <Alert tone="warning">{concurrentNotice}</Alert>}
      {fixtures.length === 0 && (
        <p className="cl-card__description">
          <FormattedMessage {...messages.scheduleBuilderNoFixtures} />
        </p>
      )}
      {fixtures.length > 0 && officials.length === 0 && (
        <p className="cl-card__description" role="status">
          <FormattedMessage {...messages.scheduleBuilderNoOfficialsAvailable} />
        </p>
      )}

      {fixtures.length > 0 && (
        <>
          <Card
            aria-label={intl.formatMessage(messages.scheduleBuilderDailyScheduleLabel)}
            className="cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.scheduleBuilderDailyScheduleLabel} />
              </h2>
            </header>
            <div className="cl-card__content">
              <div className="cl-platform-form-grid">
                <Field
                  id="schedule-filter-day"
                  label={intl.formatMessage(messages.scheduleBuilderFilterDay)}
                >
                  <Select
                    aria-label={intl.formatMessage(messages.scheduleBuilderFilterDay)}
                    id="schedule-filter-day"
                    onValueChange={setSelectedDay}
                    options={[
                      {
                        value: 'all',
                        label: intl.formatMessage(messages.scheduleBuilderAllDays),
                      },
                      ...dayOptions,
                    ]}
                    value={selectedDay}
                  />
                </Field>
                <Field
                  id="schedule-filter-venue"
                  label={intl.formatMessage(messages.scheduleBuilderFilterVenue)}
                >
                  <Select
                    aria-label={intl.formatMessage(messages.scheduleBuilderFilterVenue)}
                    id="schedule-filter-venue"
                    onValueChange={setSelectedVenue}
                    options={[
                      {
                        value: 'all',
                        label: intl.formatMessage(messages.scheduleBuilderAllVenues),
                      },
                      ...venueOptions,
                    ]}
                    value={selectedVenue}
                  />
                </Field>
              </div>

              {dayGroups.length === 0 ? (
                <p className="cl-card__description">
                  <FormattedMessage {...messages.scheduleBuilderNoMatchesForFilters} />
                </p>
              ) : (
                <div>
                  {dayGroups.map((day, dayIndex) => (
                    <details key={day.key} open={dayIndex === 0}>
                      <summary className="cl-card__title">{day.label}</summary>
                      {day.venues.map((venue) => (
                        <section key={venue.key} aria-label={venue.label}>
                          <h3 className="cl-card__title">{venue.label}</h3>
                          <ul>
                            {venue.rows.map((entry) => (
                              <li key={entry.row.matchId}>{scheduleEntryNode(entry)}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </details>
                  ))}
                </div>
              )}

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
              {publishHint && (
                <p className="cl-card__description" role="status">
                  <FormattedMessage {...publishHint} />
                </p>
              )}
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
