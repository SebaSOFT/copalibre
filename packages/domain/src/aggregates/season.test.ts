import {
  competitionName,
  IMPLICIT_SEASON_NAME,
  isImplicitSeason,
  validateSeason,
  type Season,
} from './season.js';

function season(overrides: Partial<Season> = {}): Season {
  return {
    seasonId: 's-1',
    tournamentId: 't-1',
    name: '2026',
    ordinal: 2,
    ...overrides,
  };
}

describe('a season is an edition of a tournament', () => {
  it('accepts an edition with a name and a position in the sequence', () => {
    expect(validateSeason(season()).ok).toBe(true);
  });

  it('refuses an edition with no name, because it is half of what a competition is called', () => {
    const result = validateSeason(season({ name: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEASON_INVALID');
  });

  it.each([[0], [-1], [1.5]])('refuses an ordinal of %p', (ordinal) => {
    expect(validateSeason(season({ ordinal })).ok).toBe(false);
  });
});

describe('the distinctive name is composed', () => {
  it('joins the competition and the edition', () => {
    expect(competitionName({ name: 'Torneo Apertura Nacional A' }, { name: '2026' })).toBe(
      'Torneo Apertura Nacional A 2026',
    );
  });

  it('lets two editions of one competition stay relatable', () => {
    const tournament = { name: 'Torneo Apertura Nacional A' };
    const names = [{ name: '2025' }, { name: '2026' }].map((edition) =>
      competitionName(tournament, edition),
    );

    // The strings differ, and nothing downstream has to compare them: the
    // relation is the shared tournament, which is why the name is not stored.
    expect(new Set(names).size).toBe(2);
  });
});

describe('the implicit edition', () => {
  it('is what a competition run once carries, so no stage lacks a season', () => {
    expect(isImplicitSeason({ name: IMPLICIT_SEASON_NAME, ordinal: 1 })).toBe(true);
  });

  it('is not claimed by an edition somebody named', () => {
    expect(isImplicitSeason({ name: '2026', ordinal: 1 })).toBe(false);
    expect(isImplicitSeason({ name: IMPLICIT_SEASON_NAME, ordinal: 2 })).toBe(false);
  });
});
