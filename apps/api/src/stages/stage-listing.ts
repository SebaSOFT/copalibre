import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  StageReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import { StageResponse } from '../dto/organization.dto.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { SUPPORTED_FORMATS } from '@copalibre/domain';

export async function list(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<readonly StageResponse[]> {
  const { tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const stages = await new CompetitionRepository(db).listStagesOfTournament(
    tournament.tournamentId,
  );
  const stageReadModel = new StageReadModel(db);
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  // Optional/backward-compatible: an uninstalled discipline module leaves both
  // fields absent rather than refusing a stage list that worked before.
  const availableFormats = descriptor?.availableFormats.filter((format) =>
    (SUPPORTED_FORMATS as readonly string[]).includes(format),
  );
  const formatDescriptions = descriptor?.formatDescriptions;

  return Promise.all(
    stages.map(async (stage) => {
      const record = await stageReadModel.stageRecord(stage.stageId);
      return {
        stageId: stage.stageId,
        seasonId: stage.seasonId,
        number: stage.number,
        name: stage.name,
        format: stage.format,
        seeded: record?.hasGeneratedFixtures ?? false,
        ...(availableFormats === undefined ? {} : { availableFormats }),
        ...(formatDescriptions === undefined ? {} : { formatDescriptions }),
      };
    }),
  );
}
