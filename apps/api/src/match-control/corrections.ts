import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { planCorrection } from '@copalibre/domain';
import {
  AuditReader,
  CompetitionRepository,
  MatchAssignmentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import {
  CorrectionHistoryResponse,
  CorrectionPreviewResponse,
  CorrectionRequestDto,
} from '../dto/match-control.dto.js';
import { enforceMatchCommand, enforcePolicy } from '../policy/resource-policy.js';
import {
  previewSeriesCorrection,
  readStageSeries,
  type SeriesCorrectionOutlook,
} from '../controllers/stage-series.js';
import {
  afterOutcomeChange,
  blockedPropagationOf,
  matchSideChanges,
} from '../after-outcome-change.js';
import { staleConfirmationsAfter } from '../controllers/qualification.js';
import { anullSurplusOf, resolveTournament } from './context.js';
import { stageOf } from './console-projection.js';

export async function handlePreviewCorrection(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: CorrectionRequestDto,
  request: RequestWithSubject,
): Promise<CorrectionPreviewResponse> {
  const { plan, propagation } = await planCorrectionFor(
    db,
    organizationAlias,
    tournamentAlias,
    matchId,
    body,
    request,
  );
  const series = await seriesOutlookFor(db, organizationAlias, tournamentAlias, matchId, body);
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const staleQualifications = await staleConfirmationsAfter(db, tournament, {
    matchId,
    stageId: await stageOf(db, matchId),
    replacement: plan.replacement,
  });

  return {
    changedEntrantIds: [...plan.changedEntrantIds],
    ...(propagation?.persisted ? { reResolved: matchSideChanges(propagation.reResolved) } : {}),
    ...(plan.blockedPropagation ? { blockedPropagation: { ...plan.blockedPropagation } } : {}),
    ...(series === undefined
      ? {}
      : {
          series: {
            ...series,
            becomingNotRequired: [...series.becomingNotRequired],
            becomingScheduled: [...series.becomingScheduled],
          },
        }),
    ...(staleQualifications.length === 0
      ? {}
      : {
          staleQualifications: staleQualifications.map((stale) => ({
            ...stale,
            positions: stale.positions.map((position) => ({ ...position })),
          })),
        }),
  };
}

export async function seriesOutlookFor(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: CorrectionRequestDto,
): Promise<SeriesCorrectionOutlook | undefined> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match) return undefined;

  const stageId = await stageOf(db, matchId);
  const declaration = await readStageSeries(db, {
    tournamentId: tournament.tournamentId,
    stageId,
    zoneId: await competition.findFixtureZoneId(match.fixtureId),
  });
  if (declaration === undefined) return undefined;

  const [fixtures, matches] = await Promise.all([
    competition.listFixturesOfStage(stageId),
    competition.listMatchesForStage(stageId),
  ]);
  const fixture = fixtures.find((candidate) => candidate.fixtureId === match.fixtureId);
  if (!fixture) return undefined;

  return previewSeriesCorrection({
    declaration,
    ...(fixture.homeEntrantId === undefined ? {} : { homeEntrantId: fixture.homeEntrantId }),
    ...(fixture.awayEntrantId === undefined ? {} : { awayEntrantId: fixture.awayEntrantId }),
    matches: matches
      .filter((candidate) => candidate.fixtureId === match.fixtureId)
      .sort((a, b) => a.number - b.number),
    correctedMatchId: matchId,
    replacement: {
      sides: body.sides.map((side) => ({
        entrantId: side.entrantId,
        statistics: side.statistics,
        ...(side.placement === undefined ? {} : { placement: side.placement }),
        resultReason: side.resultReason ?? 'played',
      })),
      ...(body.winnerEntrantId === undefined ? {} : { winnerEntrantId: body.winnerEntrantId }),
      recordedAt: new Date().toISOString(),
    },
  });
}

export async function handleCorrect(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: CorrectionRequestDto,
  request: RequestWithSubject,
): Promise<CorrectionPreviewResponse> {
  const { plan, organizationId, tournamentId, granted } = await planCorrectionFor(
    db,
    organizationAlias,
    tournamentAlias,
    matchId,
    body,
    request,
  );

  // Computed against the record as it stands, before the correction is written: this is the
  // same outlook the preview showed, so what the operator agreed to is what gets applied.
  const series = await seriesOutlookFor(db, organizationAlias, tournamentAlias, matchId, body);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);

  const stageId = await stageOf(db, matchId);
  const audit = {
    organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
  };
  const committed = await withTransaction(db, async (uow) => {
    // Lock the graph and refresh the preview in this transaction before the correction audit.
    const current = await afterOutcomeChange(db, uow, matchId, audit, {
      dryRun: true,
      replacement: { matchId, result: plan.replacement },
    });
    const blockedPropagation = blockedPropagationOf(plan.blockedPropagation, current, stageId);
    await competition.supersedeResult(uow, {
      matchId,
      result: plan.replacement,
      reason: plan.reason,
      ...(plan.sourceReportId === undefined ? {} : { sourceReportId: plan.sourceReportId }),
      ...(blockedPropagation ? { blockedPropagation } : {}),
      organizationId,
      actor: request.subject?.subjectId ?? 'unknown',
      authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
    });

    // A correction that revives a game brings it back playable and unplaced — the slot it
    // held was released when the series settled, and may belong to someone else by now.
    if (match && series !== undefined && series.becomingScheduled.length > 0) {
      await competition.reinstateAnulledMatches(uow, {
        fixtureId: match.fixtureId,
        matchNumbers: series.becomingScheduled,
        reason: `Reinstated by the correction to match ${matchId}: ${plan.reason}`,
        organizationId,
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
      });
    }
    if (match) {
      await anullSurplusOf(db, uow, {
        matchId,
        stageId,
        tournamentId,
        ...audit,
      });
    }
    const propagation = await afterOutcomeChange(db, uow, matchId, audit);
    return { propagation, blockedPropagation };
  });

  return {
    changedEntrantIds: [...plan.changedEntrantIds],
    ...(committed.propagation?.persisted
      ? { reResolved: matchSideChanges(committed.propagation.reResolved) }
      : {}),
    ...(committed.blockedPropagation
      ? { blockedPropagation: { ...committed.blockedPropagation } }
      : {}),
    ...(series === undefined
      ? {}
      : {
          series: {
            ...series,
            becomingNotRequired: [...series.becomingNotRequired],
            becomingScheduled: [...series.becomingScheduled],
          },
        }),
  };
}

export async function handleHistory(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  request: RequestWithSubject,
): Promise<CorrectionHistoryResponse> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
  });
  const entries = await new AuditReader(db).historyFor('match', matchId);

  return {
    corrections: entries
      .filter((entry) => entry.action === 'match.result-superseded')
      .map((entry) => ({
        occurredAt: entry.occurredAt,
        actor: entry.actor,
        reason: entry.reason ?? '',
        priorState: entry.previousState ?? {},
        resultingState: entry.resultingState ?? {},
      })),
  };
}

export async function planCorrectionFor(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: CorrectionRequestDto,
  request: RequestWithSubject,
) {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  const stageId = await stageOf(db, matchId);
  const granted = enforceMatchCommand({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
    assignments: await new MatchAssignmentRepository(db).forSubject({
      organizationId: tournament.organizationId,
      subjectId: request.subject?.subjectId ?? '',
      matchId,
      stageId,
    }),
    // Correcting a result is finalization's authority, not event entry's.
    capability: 'match.finalize',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });

  const downstream = await competition.nextStageState(tournament.tournamentId, stageId);
  const planned = planCorrection(
    {
      matchId,
      reason: body.reason,
      actor: request.subject?.subjectId ?? 'unknown',
      ...(body.sourceReportId === undefined ? {} : { sourceReportId: body.sourceReportId }),
      replacement: {
        // Same rationale as finalize: written explicitly, never implicit.
        sides: body.sides.map((side) => ({
          entrantId: side.entrantId,
          statistics: side.statistics,
          ...(side.placement === undefined ? {} : { placement: side.placement }),
          resultReason: side.resultReason ?? 'played',
        })),
        ...(body.winnerEntrantId === undefined ? {} : { winnerEntrantId: body.winnerEntrantId }),
        recordedAt: new Date().toISOString(),
      },
    },
    match.result,
    downstream,
  );

  if (!planned.ok)
    throw new BadRequestException(planned.error.message, {
      errorCode: 'match-control-bad-request',
    });
  const propagation = await withTransaction(db, (uow) =>
    afterOutcomeChange(
      db,
      uow,
      matchId,
      {
        organizationId: tournament.organizationId,
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
      },
      { dryRun: true, replacement: { matchId, result: planned.value.replacement } },
    ),
  );
  const blockedPropagation = blockedPropagationOf(
    planned.value.blockedPropagation,
    propagation,
    stageId,
  );
  const plan = { ...planned.value, ...(blockedPropagation ? { blockedPropagation } : {}) };
  return {
    plan,
    organizationId: tournament.organizationId,
    tournamentId: tournament.tournamentId,
    granted,
    propagation,
  };
}
