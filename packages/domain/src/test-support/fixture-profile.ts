import type { TournamentProfile } from '../profiles/tournament-profile.js';

/**
 * A league profile requiring a primary scoring statistic (satisfiable by
 * several discipline codes) and treating a discipline-specific defensive stat
 * as optional — the shape the capability model exists for.
 */
export function fixtureProfile(overrides?: Partial<TournamentProfile>): TournamentProfile {
  return {
    profileId: '01890000-0000-7000-8000-00000000000a',
    version: '1.2.0',
    name: 'Winter League',
    attribution: {
      author: 'CopaLibre test fixtures',
      licence: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
    requires: [
      {
        capability: 'primary-scoring',
        satisfiedBy: ['goals-for', 'points-for', 'frags'],
        necessity: 'required',
        description: 'Whatever this discipline counts as scoring',
      },
      {
        capability: 'defensive-record',
        satisfiedBy: ['goals-against', 'defence-frags'],
        necessity: 'optional',
      },
    ],
    stages: [{ number: 1, name: 'League', format: 'round-robin' }],
    points: { win: 3, draw: 1, loss: 0 },
    tiebreak: [
      {
        capability: 'primary-scoring',
        label: 'Scored',
        direction: 'higher_wins',
        missingValue: 'treat-as-zero',
      },
      {
        capability: 'defensive-record',
        label: 'Conceded',
        direction: 'lower_wins',
        missingValue: 'treat-as-worst',
      },
    ],
    ...overrides,
  };
}
