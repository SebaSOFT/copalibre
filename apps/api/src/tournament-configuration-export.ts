import {
  compileEffectiveRuleset,
  type DisciplineDescriptor,
  type HookScriptAttachment,
  type MatchRuleset,
  type OverrideSet,
  type Season,
  type Stage,
  type StageConfiguration,
  type Tournament,
  type TournamentRuleset,
} from '@copalibre/domain';
import { CompetitionRepository, TournamentRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';

export const TOURNAMENT_CONFIGURATION_EXPORT_TABLES = Object.freeze([
  'tournaments',
  'discipline_descriptors',
  'tournament_rulesets',
  'seasons',
  'stages',
  'stage_configurations',
] as const);

export interface TournamentConfigurationExportDocument {
  readonly kind: 'copalibre-tournament-configuration';
  readonly schemaVersion: '1.0.0';
  readonly tournament: {
    readonly alias: string;
    readonly name: string;
    readonly status: Tournament['status'];
    readonly disciplineRef: Tournament['disciplineRef'];
    readonly profileRef?: NonNullable<Tournament['profileRef']>;
  };
  readonly ruleset: {
    readonly version: number;
    readonly rawOverrides: OverrideSet;
    readonly customScripts: readonly HookScriptAttachment[];
    readonly effective: MatchRuleset;
  };
  readonly seasons: readonly {
    readonly name: string;
    readonly ordinal: number;
    readonly stages: readonly {
      readonly number: number;
      readonly name: string;
      readonly format: string;
      readonly configuration: {
        readonly version?: number;
        readonly rawOverrides: OverrideSet;
        readonly effective: MatchRuleset;
      };
    }[];
  }[];
}

interface ExportInputs {
  readonly tournament: Tournament;
  readonly descriptor: DisciplineDescriptor;
  readonly ruleset: TournamentRuleset;
  readonly seasons: readonly Season[];
  readonly stages: readonly {
    readonly stage: Stage;
    readonly configuration?: StageConfiguration;
  }[];
}

export async function exportTournamentConfiguration(
  db: Kysely<Database>,
  tournament: Tournament,
): Promise<TournamentConfigurationExportDocument> {
  const tournaments = new TournamentRepository(db);
  const competition = new CompetitionRepository(db);
  const [ruleset, seasons, stages] = await Promise.all([
    tournaments.findLatestRuleset(tournament.tournamentId),
    competition.listSeasons(tournament.tournamentId),
    competition.listStagesOfTournament(tournament.tournamentId),
  ]);
  if (!ruleset) throw new Error(`Tournament ${tournament.alias} has no ruleset to export`);

  const descriptor = await tournaments.findDescriptor(
    ruleset.descriptorRef.descriptorId,
    ruleset.descriptorRef.version,
  );
  if (!descriptor) throw new Error(`Tournament ${tournament.alias} descriptor is unavailable`);

  const stagesWithConfiguration = await Promise.all(
    stages.map(async (stage) => ({
      stage,
      configuration: await tournaments.findLatestStageConfiguration(stage.stageId),
    })),
  );
  return buildTournamentConfigurationExport({
    tournament,
    descriptor,
    ruleset,
    seasons,
    stages: stagesWithConfiguration,
  });
}

export function buildTournamentConfigurationExport(
  input: ExportInputs,
): TournamentConfigurationExportDocument {
  const tournamentEffective = compile(input.descriptor, input.ruleset);
  const stagesBySeason = new Map<string, ExportInputs['stages']>();
  for (const stage of input.stages) {
    const current = stagesBySeason.get(stage.stage.seasonId) ?? [];
    stagesBySeason.set(stage.stage.seasonId, [...current, stage]);
  }

  return {
    kind: 'copalibre-tournament-configuration',
    schemaVersion: '1.0.0',
    tournament: {
      alias: input.tournament.alias,
      name: input.tournament.name,
      status: input.tournament.status,
      disciplineRef: { ...input.tournament.disciplineRef },
      ...(input.tournament.profileRef ? { profileRef: { ...input.tournament.profileRef } } : {}),
    },
    ruleset: {
      version: input.ruleset.version,
      rawOverrides: structuredClone(input.ruleset.overrides),
      customScripts: structuredClone(input.ruleset.customScripts),
      effective: tournamentEffective,
    },
    seasons: input.seasons.map((season) => ({
      name: season.name,
      ordinal: season.ordinal,
      stages: (stagesBySeason.get(season.seasonId) ?? []).map(({ stage, configuration }) => ({
        number: stage.number,
        name: stage.name,
        format: stage.format,
        configuration: {
          ...(configuration ? { version: configuration.version } : {}),
          rawOverrides: structuredClone(configuration?.overrides ?? {}),
          effective: compile(input.descriptor, input.ruleset, configuration),
        },
      })),
    })),
  };
}

function compile(
  descriptor: DisciplineDescriptor,
  ruleset: TournamentRuleset,
  stage?: StageConfiguration,
): MatchRuleset {
  const result = compileEffectiveRuleset(descriptor, ruleset, stage);
  if (!result.ok) throw result.error;
  return result.value;
}
