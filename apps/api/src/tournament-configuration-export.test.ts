import { footballDescriptor, type Season, type Stage } from '@copalibre/domain';
import {
  TOURNAMENT_CONFIGURATION_EXPORT_TABLES,
  buildTournamentConfigurationExport,
} from './tournament-configuration-export.js';

describe('tournament configuration export', () => {
  it('reads only configuration sources and emits no result, standings, event, or participant keys', () => {
    expect(TOURNAMENT_CONFIGURATION_EXPORT_TABLES).toEqual([
      'tournaments',
      'discipline_descriptors',
      'tournament_rulesets',
      'seasons',
      'stages',
      'stage_configurations',
    ]);
    expect(TOURNAMENT_CONFIGURATION_EXPORT_TABLES).not.toEqual(
      expect.arrayContaining([
        'matches',
        'match_events',
        'materialised_standings',
        'entrants',
        'persons',
      ]),
    );

    const descriptor = footballDescriptor();
    const season: Season = {
      seasonId: '01890000-0000-7000-8000-000000000101',
      tournamentId: '01890000-0000-7000-8000-000000000100',
      name: 'Edición única',
      ordinal: 1,
    };
    const stage: Stage = {
      stageId: '01890000-0000-7000-8000-000000000102',
      seasonId: season.seasonId,
      number: 1,
      name: 'League',
      format: 'round-robin',
    };
    const document = buildTournamentConfigurationExport({
      tournament: {
        tournamentId: season.tournamentId,
        organizationId: '01890000-0000-7000-8000-000000000103',
        alias: 'copa-configurable',
        name: 'Copa Configurable',
        disciplineRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
        rulesetId: '01890000-0000-7000-8000-000000000104',
        status: 'draft',
      },
      descriptor,
      ruleset: {
        rulesetId: '01890000-0000-7000-8000-000000000104',
        tournamentId: season.tournamentId,
        version: 1,
        descriptorRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
        overrides: { format: 'round-robin', 'registration.capacity': 16 },
        customScripts: [],
      },
      seasons: [season],
      stages: [
        {
          stage,
          configuration: {
            stageConfigurationId: '01890000-0000-7000-8000-000000000105',
            stageId: stage.stageId,
            version: 1,
            rulesetId: '01890000-0000-7000-8000-000000000104',
            overrides: { 'scoring.pointsPerWin': 4 },
          },
        },
      ],
    });

    expect(document.seasons[0]?.stages[0]?.configuration.effective.config).toMatchObject({
      scoring: { pointsPerWin: 4 },
    });
    const keys = collectKeys(document);
    expect(keys).not.toEqual(
      expect.arrayContaining([
        'matches',
        'result',
        'standings',
        'events',
        'participants',
        'persons',
      ]),
    );
  });
});

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)]);
}
