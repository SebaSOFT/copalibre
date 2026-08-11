import { fixtureProfile } from '../test-support/fixture-profile.js';
import { validateTournamentProfileDocument } from './profile-schema.js';

function asDocument(overrides: Record<string, unknown> = {}): unknown {
  const document = JSON.parse(JSON.stringify(fixtureProfile())) as Record<string, unknown>;
  delete document.profileId;
  return JSON.parse(JSON.stringify({ ...document, ...overrides })) as unknown;
}

describe('tournament profile schema', () => {
  it('accepts the reference profile as a document without an installed identifier', () => {
    expect(validateTournamentProfileDocument(asDocument()).ok).toBe(true);
  });

  it.each([
    ['stage format', { stages: [{ number: 1, name: 'League' }] }, 'stages.0'],
    [
      'tiebreak capability',
      {
        tiebreak: [
          {
            label: 'Scored',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
          },
        ],
      },
      'tiebreak.0',
    ],
  ])('rejects a missing %s and names the offending member', (_label, overrides, field) => {
    const result = validateTournamentProfileDocument(asDocument(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TOURNAMENT_PROFILE_VALIDATION_FAILED');
    expect(result.error.details?.field).toBe(field);
  });

  it('validates a replacement win condition through the registered rule-script schema', () => {
    const result = validateTournamentProfileDocument(asDocument({ winConditionOverride: {} }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.field).toBe('winConditionOverride');
  });
});
