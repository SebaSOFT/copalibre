import {
  CompetitionRepository,
  type Database,
  StageReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import { NotFoundException, BadRequestException } from '../http/error-contract.js';
import type { Kysely } from 'kysely';
import { type TournamentFormat, SUPPORTED_FORMATS } from '@copalibre/domain';
import type { RequestWithSubject } from '../auth/request-context.js';

export async function findStage(
  competition: CompetitionRepository,
  tournamentId: string,
  stageNumber: number,
) {
  const stages = await competition.listStagesOfTournament(tournamentId);
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage) {
    throw new NotFoundException(`No stage ${stageNumber} in this tournament`, {
      errorCode: 'stage-not-found',
    });
  }
  return stage;
}

/** Shared by the configuration preview and edit routes: what `evaluateMutation` needs to know. */
export async function stageMutationContext(
  db: Kysely<Database>,
  stageId: string,
): Promise<{
  readonly hasRecordedResults: boolean;
  readonly generatedFixtures: readonly {
    fixtureId: string;
    stageId: string;
    hasResult: boolean;
  }[];
  readonly previousValues: Record<string, unknown>;
}> {
  const readModel = new StageReadModel(db);
  const record = await readModel.stageRecord(stageId);
  const matches = await readModel.matches(stageId);
  const generatedFixtures = matches.map((match) => ({
    fixtureId: match.matchId,
    stageId,
    hasResult: match.status === 'finalized',
  }));
  const configuration = await new TournamentRepository(db).findLatestStageConfiguration(stageId);
  return {
    hasRecordedResults: record?.hasRecordedResults ?? false,
    generatedFixtures,
    previousValues: configuration?.overrides ?? {},
  };
}

/**
 * Defaults to the tournament's own configured format (set at tournament creation,
 * `overrides['format']` on its latest ruleset — `tournaments.controller.ts`'s `create()`) when the
 * request supplies none. An explicit override is validated identically to tournament creation's own
 * check: a stage cannot be created in a format the installed discipline module does not support.
 */
export async function resolveFormat(
  db: Kysely<Database>,
  tournamentId: string,
  descriptor: { readonly availableFormats: readonly string[] },
  requested: string | undefined,
): Promise<TournamentFormat> {
  const available = new Set<string>(descriptor.availableFormats);

  if (requested !== undefined) {
    if (
      !(SUPPORTED_FORMATS as readonly string[]).includes(requested) ||
      !available.has(requested)
    ) {
      throw new BadRequestException(`This tournament's discipline does not support ${requested}`, {
        errorCode: 'stage-bad-request',
      });
    }
    return requested as TournamentFormat;
  }

  const ruleset = await new TournamentRepository(db).findLatestRuleset(tournamentId);
  const configured = ruleset?.overrides['format'];
  if (typeof configured !== 'string' || configured.length === 0) {
    throw new BadRequestException(
      'No format was supplied and this tournament has no configured format to default to',
      { errorCode: 'stage-bad-request' },
    );
  }
  return configured as TournamentFormat;
}

export function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}

export function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}
