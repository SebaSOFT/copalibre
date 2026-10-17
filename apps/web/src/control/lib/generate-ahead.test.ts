import { aheadPreviewMatches, isGeneratedAhead } from './generate-ahead.js';
import { qualifierSeeds } from '../components/screen-story-fixtures.js';

describe('aheadPreviewMatches', () => {
  it('seats each qualifier where its seed sits, so the plan decides the cross-overs', () => {
    const matches = aheadPreviewMatches({ format: 'single-elimination', seeds: qualifierSeeds });
    const semis = matches.filter((match) => match.round === 1);
    expect(
      semis.map((match) =>
        match.slots.map((slot) => (slot.kind === 'qualifier' ? slot.source?.position : slot.kind)),
      ),
    ).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(semis[0]?.slots[0]?.source).toMatchObject({
      kind: 'qualifier',
      qualifierLabel: { kind: 'group-rank', rank: 1, groupName: 'Grupo A' },
    });
    const final = matches.find((match) => match.round === 2);
    expect(final?.slots.map((slot) => slot.kind)).toEqual(['winner-of', 'winner-of']);
  });

  it('keeps byes for a field that is not a power of two', () => {
    const matches = aheadPreviewMatches({
      format: 'single-elimination',
      seeds: qualifierSeeds.slice(0, 3),
    });
    expect(matches.flatMap((match) => match.slots).some((slot) => slot.kind === 'bye')).toBe(true);
  });

  it('draws nothing for a format the engine cannot generate', () => {
    expect(aheadPreviewMatches({ format: 'unknown-format', seeds: qualifierSeeds })).toEqual([]);
  });
});

describe('isGeneratedAhead', () => {
  it('reads a bracket whose sides name qualifiers as generated ahead', () => {
    const qualifierSlot = {
      kind: 'qualifier' as const,
      source: { kind: 'qualifier' as const, position: 1 },
    };
    const match = {
      matchId: 'SE-R1-M1',
      bracket: 'winners',
      round: 1,
      position: 1,
      status: 'scheduled',
    };
    expect(isGeneratedAhead([{ matches: [{ ...match, slots: [qualifierSlot] }] }])).toBe(true);
    expect(
      isGeneratedAhead([{ matches: [{ ...match, slots: [{ kind: 'entrant', entrantId: 'a' }] }] }]),
    ).toBe(false);
  });
});
