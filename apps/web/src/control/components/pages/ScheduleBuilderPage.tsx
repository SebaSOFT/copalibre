import { RealtimeClient } from '@copalibre/realtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type ScheduleAssignmentDto,
  type ScheduleConflictDto,
  type ScheduleReasonDto,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import {
  ScheduleBuilderTemplate,
  type DraftAssignment,
} from '../screens/ScheduleBuilderTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

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

  const [draftOverride, setDrafts] = useState<Readonly<Record<string, DraftAssignment>>>();
  const dirtyDraft = useRef(false);
  const [conflicts, setConflicts] = useState<readonly ScheduleConflictDto[]>([]);
  const [conflictOverride, setCurrentConflicts] = useState<readonly ScheduleConflictDto[]>();
  const [affectedPublishedMatches, setAffectedPublishedMatches] = useState<readonly string[]>([]);
  const [reasonRequiredMatches, setReasonRequiredMatches] = useState<readonly string[]>([]);
  const [freedSlotIds, setFreedSlotIds] = useState<readonly string[]>([]);
  const [committable, setCommittable] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [concurrentNotice, setConcurrentNotice] = useState<string>();
  const currentDraft = useRef<Readonly<Record<string, DraftAssignment>>>({});
  const previewGeneration = useRef(0);

  const read = useResilientRead(
    `control-schedule:${organizationAlias}:${tournamentAlias}:${stageNumber}`,
    async () => {
      const [fixturesResponse, venues, officials, schedules] = await Promise.all([
        api.getStageFixtures?.(organizationAlias, tournamentAlias, stageNumber),
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
        api.listSchedules?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      if (!fixturesResponse) throw new Error('Stage fixtures are unavailable');
      const schedule = await api.getSchedule?.(
        organizationAlias,
        tournamentAlias,
        fixturesResponse.stageId,
      );
      return {
        stageId: fixturesResponse.stageId,
        fixtures: fixturesResponse.fixtures,
        venues,
        officials,
        schedules,
        schedule,
      };
    },
    {
      thing: intl.formatMessage(messages.scheduleBuilderTitle),
      onSuccess: ({ schedule }) => {
        setCurrentConflicts(schedule?.conflicts ?? []);
        if (dirtyDraft.current) return;
        setDrafts(undefined);
        setPreviewed(false);
        setConflicts([]);
      },
    },
  );
  const assignments = read.data?.schedule?.assignments ?? [];
  const savedDrafts = Object.fromEntries(
    assignments.map((assignment) => [
      assignment.matchId,
      {
        slotId: assignment.slotId,
        officialIds: assignment.officialIds ?? [],
      },
    ]),
  );
  const drafts = draftOverride ?? savedDrafts;
  const placements = Object.fromEntries(
    assignments.map((assignment) => [assignment.matchId, assignment.slotId]),
  );
  const currentConflicts = conflictOverride ?? read.data?.schedule?.conflicts ?? [];
  useEffect(() => {
    currentDraft.current = drafts;
  }, [drafts]);
  const { stageId, fixtures = [], venues = [], officials = [], schedules = [] } = read.data ?? {};
  const reload = read.refresh;
  const conflictsRead = useResilientRead(
    `control-schedule-conflicts:${organizationAlias}:${tournamentAlias}:${stageId}`,
    () =>
      stageId === undefined
        ? Promise.resolve(undefined)
        : (api.getSchedule?.(organizationAlias, tournamentAlias, stageId) ??
          Promise.resolve(undefined)),
    {
      thing: intl.formatMessage(messages.scheduleBuilderTitle),
      enabled: false,
      onSuccess: (schedule) => setCurrentConflicts(schedule?.conflicts ?? []),
    },
  );
  const refreshConflicts = conflictsRead.refresh;
  const reasonsRead = useResilientRead(
    `control-schedule-reasons:${organizationAlias}`,
    () => api.recentScheduleReasons?.(organizationAlias) ?? Promise.resolve({ reasons: [] }),
    {
      thing: intl.formatMessage(messages.scheduleBuilderTitle),
      enabled: reasonRequiredMatches.length > 0,
    },
  );
  const recentReasons = reasonsRead.data?.reasons ?? [];

  useEffect(() => {
    const stream = api.controlStream?.(organizationAlias);
    if (!stream || !stageId) return;
    let active = true;
    const client = new RealtimeClient(stream);
    const versions = new Map<string, number>();
    const repreview = async (): Promise<void> => {
      const generation = ++previewGeneration.current;
      setPreviewed(false);
      setCommittable(false);
      const batch = Object.entries(currentDraft.current).flatMap<ScheduleAssignmentDto>(
        ([matchId, draft]) =>
          draft.withdraw
            ? [{ matchId, withdraw: true as const }]
            : draft.slotId
              ? [{ matchId, slotId: draft.slotId, officialIds: draft.officialIds }]
              : [],
      );
      if (!api.previewSchedule || batch.length === 0) return;
      try {
        const result = await api.previewSchedule(organizationAlias, tournamentAlias, stageId, {
          assignments: batch,
        });
        if (!active || generation !== previewGeneration.current) return;
        setConflicts(result.conflicts);
        setAffectedPublishedMatches(result.affectedPublishedMatches);
        setReasonRequiredMatches(result.reasonRequiredMatches ?? []);
        setFreedSlotIds(result.freedSlotIds ?? []);
        setCommittable(result.committable);
        setPreviewed(true);
      } catch (error) {
        if (active) pushError(error);
      }
    };
    void client.connect({
      onEvent: (event) => {
        // A result resolved a side into a clash with a published placement: re-read what is real now.
        if (event.eventType === 'schedule.conflict-arose') {
          void refreshConflicts();
          return;
        }
        if (event.eventType !== 'match.rescheduled' || event.payload.stageId !== stageId) return;
        const matchId = event.payload.matchId;
        if (typeof matchId !== 'string' || event.projectionVersion <= (versions.get(matchId) ?? 0))
          return;
        versions.set(matchId, event.projectionVersion);
        const actor = event.payload.actor;
        const token = stream.accessToken?.();
        let ownActor: string | undefined;
        try {
          const part = token?.split('.')[1];
          if (part)
            ownActor = `user:${(JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }).sub}`;
        } catch {
          /* No readable subject: keep the server's authoritative change visible. */
        }
        if (actor === ownActor) return;
        const fixture = fixtures.find(
          (entry) =>
            entry.matchId === matchId || entry.matches?.some((match) => match.matchId === matchId),
        );
        if (!fixture) return;
        const game = intl.formatMessage(messages.scheduleBuilderSeriesGame, {
          number: fixture.matches?.find((entry) => entry.matchId === matchId)?.number ?? 1,
          span: fixture.series?.span ?? 1,
        });
        const match = [
          fixture.homeName ?? intl.formatMessage(messages.matchesViewResultStateTbd),
          fixture.awayName ?? intl.formatMessage(messages.matchesViewResultStateTbd),
          game,
        ]
          .filter(Boolean)
          .join(' · ');
        setConcurrentNotice(
          intl.formatMessage(messages.scheduleConcurrentChange, {
            match,
            actor: String(event.payload.actorName ?? actor ?? ''),
          }),
        );
        void repreview();
      },
      onProjectionRequired: () => void repreview(),
    });
    return () => {
      active = false;
      client.close();
    };
  }, [
    api,
    organizationAlias,
    tournamentAlias,
    stageId,
    fixtures,
    intl,
    pushError,
    refreshConflicts,
  ]);

  function setDraft(matchId: string, patch: Partial<DraftAssignment>): void {
    dirtyDraft.current = true;
    setDrafts((current) => ({
      ...(current ?? drafts),
      [matchId]: { ...((current ?? drafts)[matchId] ?? EMPTY_DRAFT), ...patch },
    }));
    previewGeneration.current += 1;
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
    const generation = ++previewGeneration.current;
    try {
      const result = await api.previewSchedule(organizationAlias, tournamentAlias, stageId, {
        assignments: batch,
      });
      if (generation !== previewGeneration.current) return;
      setConflicts(result.conflicts);
      setAffectedPublishedMatches(result.affectedPublishedMatches);
      setReasonRequiredMatches(result.reasonRequiredMatches ?? []);
      setFreedSlotIds(result.freedSlotIds ?? []);
      setCommittable(result.committable);
      setPreviewed(true);
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
      dirtyDraft.current = false;
      void reload();
    } catch (error) {
      // Refused for conflicts that arose since the preview: list them, worded, as a preview would.
      if (error instanceof ControlApiError && error.conflicts !== undefined) {
        previewGeneration.current += 1;
        setConflicts(error.conflicts);
        setCommittable(false);
        setPreviewed(true);
        push({
          severity: 'error',
          message: intl.formatMessage(messages.scheduleBuilderPublishRefused),
        });
        return;
      }
      pushError(error);
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.scheduleBuilderTitle)} />;

  return (
    <ReadState
      {...read}
      status={
        read.status === 'stale' ||
        conflictsRead.status === 'stale' ||
        reasonsRead.status === 'stale'
          ? 'stale'
          : read.status
      }
      staleSince={read.staleSince ?? conflictsRead.staleSince ?? reasonsRead.staleSince}
      title={intl.formatMessage(messages.scheduleBuilderTitle)}
    >
      <ScheduleBuilderTemplate
        concurrentNotice={concurrentNotice}
        affectedPublishedMatches={affectedPublishedMatches}
        committable={committable}
        conflicts={conflicts}
        currentConflicts={currentConflicts}
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
    </ReadState>
  );
}
