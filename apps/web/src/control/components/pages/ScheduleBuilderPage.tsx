import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type FixtureResponse,
  type OfficialResponse,
  type ScheduleAssignmentDto,
  type ScheduleConflictDto,
  type ScheduleDetailResponse,
  type ScheduleReasonDto,
  type VenueResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import {
  ScheduleBuilderTemplate,
  type DraftAssignment,
} from '../screens/ScheduleBuilderTemplate.js';

const EMPTY_DRAFT: DraftAssignment = {
  slotId: '',
  officialIds: [],
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
 *
 * Fetches and mutates: every call into the API
 * client lives here — including the manual assignment drafts, which live
 * here rather than in `ScheduleBuilderTemplate` since `reload` reseeds them
 * from the server on every load and after every publish.
 */
export function ScheduleBuilderPage({
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
  const [reasonRequiredMatches, setReasonRequiredMatches] = useState<readonly string[]>([]);
  const [freedSlotIds, setFreedSlotIds] = useState<readonly string[]>([]);
  const [placements, setPlacements] = useState<Readonly<Record<string, string>>>({});
  const [recentReasons, setRecentReasons] = useState<readonly string[]>([]);
  const [committable, setCommittable] = useState(false);
  const [previewed, setPreviewed] = useState(false);

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
      const nextPlacements: Record<string, string> = {};
      for (const assignment of schedule?.assignments ?? []) {
        nextDrafts[assignment.matchId] = {
          slotId: assignment.slotId,
          officialIds: assignment.officialIds ?? [],
        };
        nextPlacements[assignment.matchId] = assignment.slotId;
      }
      setDrafts(nextDrafts);
      setPlacements(nextPlacements);
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

  function toggleOfficial(matchId: string, officialId: string): void {
    const current = drafts[matchId] ?? EMPTY_DRAFT;
    setDraft(matchId, {
      officialIds: current.officialIds.includes(officialId)
        ? current.officialIds.filter((candidate) => candidate !== officialId)
        : [...current.officialIds, officialId],
    });
  }

  async function preview(batch: readonly ScheduleAssignmentDto[]): Promise<void> {
    if (!api.previewSchedule || stageId === undefined || batch.length === 0) return;
    try {
      const result = await api.previewSchedule(organizationAlias, tournamentAlias, stageId, {
        assignments: batch,
      });
      setConflicts(result.conflicts);
      setAffectedPublishedMatches(result.affectedPublishedMatches);
      setReasonRequiredMatches(result.reasonRequiredMatches ?? []);
      setFreedSlotIds(result.freedSlotIds ?? []);
      setCommittable(result.committable);
      setPreviewed(true);
      // The reason prompt offers the organization's own recent wording; it is a nicety, so a
      // failed read leaves the presets alone rather than failing the preview.
      if ((result.reasonRequiredMatches ?? []).length > 0 && api.recentScheduleReasons) {
        void api
          .recentScheduleReasons(organizationAlias)
          .then((response) => setRecentReasons(response.reasons))
          .catch(() => setRecentReasons([]));
      }
    } catch (error) {
      pushError(error);
    }
  }

  async function publish(
    batch: readonly ScheduleAssignmentDto[],
    reason?: ScheduleReasonDto,
  ): Promise<void> {
    if (!api.publishSchedule || stageId === undefined || batch.length === 0) return;
    try {
      await api.publishSchedule(organizationAlias, tournamentAlias, stageId, {
        assignments: batch,
        ...(reason === undefined ? {} : { reason }),
      });
      push({ severity: 'success', message: intl.formatMessage(messages.scheduleBuilderPublished) });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.scheduleBuilderLoading)}</Alert>;
  }
  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <ScheduleBuilderTemplate
      affectedPublishedMatches={affectedPublishedMatches}
      committable={committable}
      conflicts={conflicts}
      drafts={drafts}
      fixtures={fixtures}
      freedSlotIds={freedSlotIds}
      officials={officials}
      onPreview={(batch) => void preview(batch)}
      onPublish={(batch, reason) => void publish(batch, reason)}
      onSetDraft={setDraft}
      onToggleOfficial={toggleOfficial}
      organizationAlias={organizationAlias}
      placements={placements}
      previewed={previewed}
      reasonRequiredMatches={reasonRequiredMatches}
      recentReasons={recentReasons}
      schedules={schedules}
      stageNumber={stageNumber}
      tournamentAlias={tournamentAlias}
      venues={venues}
    />
  );
}
