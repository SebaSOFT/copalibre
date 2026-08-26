import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type FixtureResponse,
  type OfficialResponse,
  type ScheduleAssignmentDto,
  type ScheduleConflictDto,
  type VenueResponse,
} from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

interface DraftAssignment {
  readonly startsAt: string;
  readonly durationMinutes: string;
  readonly venueId: string;
  readonly officialIds: readonly string[];
}

const EMPTY_DRAFT: DraftAssignment = {
  startsAt: '',
  durationMinutes: '',
  venueId: '',
  officialIds: [],
};

/**
 * The schedule builder: a calendar view and a list view over one
 * stage's fixtures, both driving the same manual assignment batch the
 * already-accepted `tournament-engine/resource-scheduling` API accepts —
 * build, preview (showing conflicts and downstream-affected published
 * fixtures exactly as the API reports them), then explicitly publish.
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
  const [drafts, setDrafts] = useState<Readonly<Record<string, DraftAssignment>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [conflicts, setConflicts] = useState<readonly ScheduleConflictDto[]>([]);
  const [affectedPublishedFixtures, setAffectedPublishedFixtures] = useState<readonly string[]>([]);
  const [committable, setCommittable] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  const draftFor = useCallback(
    (fixtureId: string): DraftAssignment => drafts[fixtureId] ?? EMPTY_DRAFT,
    [drafts],
  );

  function assignmentFrom(
    fixtureId: string,
    draft: DraftAssignment,
  ): ScheduleAssignmentDto | undefined {
    if (draft.startsAt === '' || draft.durationMinutes === '') return undefined;
    const startsAt = Date.parse(draft.startsAt);
    const durationMinutes = Number(draft.durationMinutes);
    if (!Number.isFinite(startsAt) || !Number.isFinite(durationMinutes)) return undefined;
    return {
      fixtureId,
      window: { startsAt, durationMinutes },
      ...(draft.venueId === '' ? {} : { venueId: draft.venueId }),
      ...(draft.officialIds.length === 0 ? {} : { officialIds: draft.officialIds }),
    };
  }

  const batch = useMemo(
    () =>
      fixtures
        .map((fixture) => assignmentFrom(fixture.fixtureId, draftFor(fixture.fixtureId)))
        .filter((assignment): assignment is ScheduleAssignmentDto => assignment !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignmentFrom is a pure local helper, not a dep
    [fixtures, drafts, draftFor],
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [fixturesResponse, loadedVenues, loadedOfficials] = await Promise.all([
        api.getStageFixtures?.(organizationAlias, tournamentAlias, stageNumber),
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      if (!fixturesResponse) throw new Error('no fixtures client configured');
      setStageId(fixturesResponse.stageId);
      setFixtures(fixturesResponse.fixtures);
      setVenues(loadedVenues);
      setOfficials(loadedOfficials);

      const schedule = await api.getSchedule?.(
        organizationAlias,
        tournamentAlias,
        fixturesResponse.stageId,
      );
      const nextDrafts: Record<string, DraftAssignment> = {};
      for (const assignment of schedule?.assignments ?? []) {
        nextDrafts[assignment.fixtureId] = {
          startsAt: new Date(assignment.window.startsAt).toISOString().slice(0, 16),
          durationMinutes: String(assignment.window.durationMinutes),
          venueId: assignment.venueId ?? '',
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

  function setDraft(fixtureId: string, patch: Partial<DraftAssignment>): void {
    setDrafts((current) => ({
      ...current,
      [fixtureId]: { ...(current[fixtureId] ?? EMPTY_DRAFT), ...patch },
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
      setAffectedPublishedFixtures(result.affectedPublishedFixtures);
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

  function toggleOfficial(fixtureId: string, officialId: string): void {
    const current = draftFor(fixtureId).officialIds;
    setDraft(fixtureId, {
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
    ...new Set(fixtures.flatMap((fixture) => [fixture.homeEntrantId, fixture.awayEntrantId])),
  ].filter((entrantId): entrantId is string => entrantId !== undefined);
  const scheduledEntrantIds = new Set(
    fixtures
      .filter((fixture) => draftFor(fixture.fixtureId).startsAt !== '')
      .flatMap((fixture) => [fixture.homeEntrantId, fixture.awayEntrantId]),
  );

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentAlias} &gt; Stage {stageNumber}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.scheduleBuilderTitle} />;

  const toolbarNode = (
    <a
      className="cl-focusable"
      href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/standings`}
      onClick={controlLinkClick(
        `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/standings`,
      )}
    >
      <FormattedMessage {...messages.standingsTitle} />
    </a>
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
          <section
            aria-label={intl.formatMessage(messages.scheduleBuilderCalendarViewLabel)}
            className="cl-card cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.scheduleBuilderCalendarViewLabel} />
              </h2>
            </header>
            <div className="cl-card__content">
              <ul>
                {fixtures.map((fixture) => {
                  const draft = draftFor(fixture.fixtureId);
                  const assigned = draft.startsAt !== '';
                  const venue = venues.find((candidate) => candidate.venueId === draft.venueId);
                  const assignedOfficials = officials.filter((candidate) =>
                    draft.officialIds.includes(candidate.officialId),
                  );
                  return (
                    <li key={fixture.fixtureId} className="cl-role-user">
                      <span>
                        <FormattedMessage
                          {...messages.scheduleBuilderFixtureRound}
                          values={{ round: fixture.round }}
                        />
                        {' — '}
                        {fixture.homeEntrantId ?? '—'} vs {fixture.awayEntrantId ?? '—'}
                      </span>
                      <span>
                        {assigned ? (
                          <>
                            {draft.startsAt}
                            {draft.durationMinutes && ` (${draft.durationMinutes}m)`}
                            {venue && ` @ ${venue.name}`}
                            {assignedOfficials.length > 0 &&
                              ` · ${assignedOfficials.map((candidate) => candidate.displayName).join(', ')}`}
                          </>
                        ) : (
                          intl.formatMessage(messages.scheduleBuilderUnassigned)
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section
            aria-label={intl.formatMessage(messages.scheduleBuilderListViewLabel)}
            className="cl-card cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.scheduleBuilderListViewLabel} />
              </h2>
            </header>
            <div className="cl-card__content">
              {fixtures.map((fixture) => {
                const draft = draftFor(fixture.fixtureId);
                return (
                  <div key={fixture.fixtureId} className="cl-platform-form-grid">
                    <label className="cl-form-field">
                      <span className="cl-label">
                        <FormattedMessage {...messages.scheduleBuilderStartTime} />
                      </span>
                      <input
                        aria-label={`${intl.formatMessage(messages.scheduleBuilderStartTime)} — ${fixture.fixtureId}`}
                        className="cl-input cl-input--default"
                        onChange={(event) =>
                          setDraft(fixture.fixtureId, { startsAt: event.target.value })
                        }
                        type="datetime-local"
                        value={draft.startsAt}
                      />
                    </label>
                    <label className="cl-form-field">
                      <span className="cl-label">
                        <FormattedMessage {...messages.scheduleBuilderDuration} />
                      </span>
                      <input
                        aria-label={`${intl.formatMessage(messages.scheduleBuilderDuration)} — ${fixture.fixtureId}`}
                        className="cl-input cl-input--default"
                        min={1}
                        onChange={(event) =>
                          setDraft(fixture.fixtureId, { durationMinutes: event.target.value })
                        }
                        type="number"
                        value={draft.durationMinutes}
                      />
                    </label>
                    <label className="cl-form-field">
                      <span className="cl-label">
                        <FormattedMessage {...messages.scheduleBuilderVenue} />
                      </span>
                      <select
                        aria-label={`${intl.formatMessage(messages.scheduleBuilderVenue)} — ${fixture.fixtureId}`}
                        className="cl-select cl-select--default"
                        onChange={(event) =>
                          setDraft(fixture.fixtureId, { venueId: event.target.value })
                        }
                        value={draft.venueId}
                      >
                        <option value="">
                          {intl.formatMessage(messages.scheduleBuilderNoVenue)}
                        </option>
                        {venues.map((venue) => (
                          <option key={venue.venueId} value={venue.venueId}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="cl-role-user">
                      <legend className="cl-label">
                        <FormattedMessage {...messages.scheduleBuilderOfficials} />
                      </legend>
                      {officials.map((official) => (
                        <label key={official.officialId} className="cl-form-field">
                          <input
                            checked={draft.officialIds.includes(official.officialId)}
                            onChange={() => toggleOfficial(fixture.fixtureId, official.officialId)}
                            type="checkbox"
                          />
                          {official.displayName}
                        </label>
                      ))}
                    </fieldset>
                  </div>
                );
              })}

              {entrantIds
                .filter((entrantId) => !scheduledEntrantIds.has(entrantId))
                .map((entrantId) => (
                  <p key={entrantId} className="cl-card__description">
                    {entrantId} — <FormattedMessage {...messages.scheduleBuilderDayOff} />
                  </p>
                ))}
            </div>
          </section>

          <section className="cl-card cl-chamfer cl-chamfer--control">
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

              {previewed && affectedPublishedFixtures.length > 0 && (
                <p className="cl-inline-alert" role="alert">
                  <FormattedMessage {...messages.scheduleBuilderAffectedPublishedHeading} />
                </p>
              )}
            </div>
          </section>
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
