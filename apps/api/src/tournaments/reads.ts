import type { Kysely } from 'kysely';
import {
  type Database,
  TournamentRepository,
  CompetitionRepository,
  EnrollmentRepository,
} from '@copalibre/persistence';
import { TournamentResponse, EntrantAttributeKeysResponse } from '../dto/organization.dto.js';
import { NotFoundException, BadRequestException } from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { TournamentCompletionResponse } from '../dto/tournament-completion.dto.js';
import {
  type TournamentConfigurationExportDocument,
  exportTournamentConfiguration,
} from '../tournament-configuration-export.js';
import { recordSensitiveRead } from '../http/sensitive-read-audit.js';
import { ControlMatchesViewResponse } from '../dto/matches-view.dto.js';
import { readMatchesView, type MatchesViewRow } from '../matches-view/read.js';
import { traceLines, traceForEntrant } from '@copalibre/rules';
import { seriesResponseOf } from '../controllers/public-projections.controller.js';

export async function findByScopedAlias(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<TournamentResponse> {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament || tournament.status === 'draft') {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'tournament-not-found' },
    );
  }
  enforcePolicy({
    plane: 'public-read',
    resource: { organizationId: tournament.organizationId },
  });
  return tournament;
}

export async function completion(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentCompletionResponse> {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'tournament-not-found' },
    );
  }

  const isControlRequest = Boolean(
    request.subject && request.subject.organizationId === tournament.organizationId,
  );

  if (tournament.status === 'draft') {
    if (!isControlRequest || !request.subject) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: tournament.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });
  } else {
    if (isControlRequest && request.subject) {
      enforcePolicy({
        plane: 'admin-control',
        subject: request.subject,
        resource: {
          organizationId: tournament.organizationId,
          ownerTournamentId: tournament.tournamentId,
        },
      });
    } else {
      enforcePolicy({
        plane: 'public-read',
        resource: { organizationId: tournament.organizationId },
      });
    }
  }

  const competition = new CompetitionRepository(db);
  return competition.getTournamentCompletion(tournament.tournamentId);
}

export async function exportConfiguration(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentConfigurationExportDocument> {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });
  const exported = await exportTournamentConfiguration(db, tournament);
  await recordSensitiveRead(db, {
    organizationId: tournament.organizationId,
    entityType: 'tournament',
    entityId: tournament.tournamentId,
    action: 'tournament.configuration-exported',
    subject: request.subject,
  });
  return exported;
}

export async function matchesView(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberValue: string | undefined,
  groupId: string | undefined,
  state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
  request: RequestWithSubject,
): Promise<ControlMatchesViewResponse> {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
  });

  const stageNumber = stageNumberValue === undefined ? undefined : Number(stageNumberValue);
  if (stageNumber !== undefined && (!Number.isSafeInteger(stageNumber) || stageNumber < 1)) {
    throw new BadRequestException(`Invalid stage number "${stageNumberValue}"`, {
      errorCode: 'tournament-bad-request',
    });
  }

  const rows = await readMatchesView(db, tournament, { stageNumber, groupId, state });
  return { matches: rows.map(controlMatchResponseOf) };
}

export async function entrantAttributeKeys(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<EntrantAttributeKeysResponse> {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });

  const byEntrant = await new EnrollmentRepository(db).listTournamentAttributes(
    tournament.tournamentId,
  );
  const keys = new Set<string>();
  for (const attributes of byEntrant.values()) {
    for (const attribute of attributes) {
      // Weighted allocation ranks on a numeric value; a categorical attribute
      // (e.g. "region") has nothing to sort by.
      if (attribute.kind === 'numeric') keys.add(attribute.key);
    }
  }
  return { keys: [...keys].sort() };
}

/**
 * Every card that resolved a tiebreak gets its full trace unconditionally:
 * reaching this route at all already required `org.view-internal-standings`
 * for this tournament, so there is no further per-match narrowing to apply.
 */
export function controlMatchResponseOf(
  row: MatchesViewRow,
): ControlMatchesViewResponse['matches'][number] {
  const homeTrace =
    row.homeEntrantId === undefined || row.rawTrace === undefined
      ? []
      : traceLines(traceForEntrant(row.rawTrace, row.homeEntrantId));
  const awayTrace =
    row.awayEntrantId === undefined || row.rawTrace === undefined
      ? []
      : traceLines(traceForEntrant(row.rawTrace, row.awayEntrantId));

  return {
    matchId: row.matchId,
    ...(row.nodeKey === undefined ? {} : { nodeKey: row.nodeKey }),
    ...(row.homeSource === undefined ? {} : { homeSource: row.homeSource }),
    ...(row.awaySource === undefined ? {} : { awaySource: row.awaySource }),
    stageNumber: row.stageNumber,
    ...(row.stageName === undefined ? {} : { stageName: row.stageName }),
    matchNumber: row.matchNumber,
    round: row.round,
    status: row.status,
    ...(row.homeEntrantId === undefined ? {} : { homeEntrantId: row.homeEntrantId }),
    ...(row.homeName === undefined ? {} : { homeName: row.homeName }),
    ...(row.homeAbbreviation === undefined ? {} : { homeAbbreviation: row.homeAbbreviation }),
    ...(row.homeClubId === undefined ? {} : { homeClubId: row.homeClubId }),
    ...(row.homeClubAlias === undefined || row.homeClubAlias === ''
      ? {}
      : { homeClubAlias: row.homeClubAlias }),
    ...(row.homeEmblemObjectId === undefined ? {} : { homeEmblemObjectId: row.homeEmblemObjectId }),
    ...(row.awayEntrantId === undefined ? {} : { awayEntrantId: row.awayEntrantId }),
    ...(row.winnerEntrantId === undefined ? {} : { winnerEntrantId: row.winnerEntrantId }),
    ...(row.awayName === undefined ? {} : { awayName: row.awayName }),
    ...(row.awayAbbreviation === undefined ? {} : { awayAbbreviation: row.awayAbbreviation }),
    ...(row.awayClubId === undefined ? {} : { awayClubId: row.awayClubId }),
    ...(row.awayClubAlias === undefined || row.awayClubAlias === ''
      ? {}
      : { awayClubAlias: row.awayClubAlias }),
    ...(row.awayEmblemObjectId === undefined ? {} : { awayEmblemObjectId: row.awayEmblemObjectId }),
    ...(row.homeScore === undefined ? {} : { homeScore: row.homeScore }),
    ...(row.awayScore === undefined ? {} : { awayScore: row.awayScore }),
    ...(row.clockSeconds === undefined ? {} : { clockSeconds: row.clockSeconds }),
    ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
    ...(row.latestEvent === undefined ? {} : { latestEvent: row.latestEvent }),
    ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
    ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
    ...(row.homePosition === undefined ? {} : { homePosition: row.homePosition }),
    ...(row.awayPosition === undefined ? {} : { awayPosition: row.awayPosition }),
    ...(row.series === undefined ? {} : { series: seriesResponseOf(row.series) }),
    ...(row.decidingFactor === undefined ? {} : { decidingFactor: row.decidingFactor }),
    ...(row.decidingFactorCode === undefined ? {} : { decidingFactorCode: row.decidingFactorCode }),
    ...(row.decidingFactorRule === undefined ? {} : { decidingFactorRule: row.decidingFactorRule }),
    ...(homeTrace.length === 0 ? {} : { homeTrace: [...homeTrace] }),
    ...(awayTrace.length === 0 ? {} : { awayTrace: [...awayTrace] }),
  };
}
