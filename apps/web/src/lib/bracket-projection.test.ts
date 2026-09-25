import { describe, it, expect } from '@jest/globals';
import { mapBracketResponse } from './bracket-projection.js';
import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

describe('mapBracketResponse', () => {
  it('maps zones, resolved entrants, and finalized scores', () => {
    const response: PublicBracketResponse = {
      format: 'single-elimination',
      zones: [
        {
          zoneId: 'z1',
          zoneName: 'Zona A',
          matches: [
            {
              matchId: 'm1',
              bracket: 'winners',
              round: 1,
              position: 1,
              status: 'finalized',
              matchNumber: 1,
              slots: [
                { kind: 'entrant', entrantId: 'e1', name: 'Boca Juniors', abbreviation: 'BOC', score: 2 },
                { kind: 'entrant', entrantId: 'e2', name: 'River Plate', abbreviation: 'RIV', score: 1 },
              ],
            },
          ],
        },
      ],
    };

    const mapped = mapBracketResponse(response);
    expect(mapped.format).toBe('single-elimination');
    expect(mapped.zones).toHaveLength(1);
    const [zone] = mapped.zones;
    expect(zone?.zoneId).toBe('z1');
    expect(zone?.zoneName).toBe('Zona A');
    const [match] = zone?.matches ?? [];
    expect(match?.state).toBe('final');
    expect(match?.scores).toEqual([2, 1]);
    expect(match?.slots[0]).toMatchObject({ kind: 'entrant', name: 'Boca Juniors', entrantId: 'e1' });
  });

  it('resolves a winner-of source to its zone-scoped match position, not a cross-zone one', () => {
    const response: PublicBracketResponse = {
      zones: [
        {
          zoneId: 'zA',
          matches: [
            {
              matchId: 'match-a-1',
              bracket: 'winners',
              round: 1,
              position: 1,
              status: 'scheduled',
              slots: [
                { kind: 'entrant', name: 'Team A' },
                { kind: 'entrant', name: 'Team B' },
              ],
            },
            {
              matchId: 'match-a-2',
              bracket: 'winners',
              round: 2,
              position: 2,
              status: 'scheduled',
              slots: [{ kind: 'winner-of', matchId: 'match-a-1' }],
            },
          ],
        },
        {
          zoneId: 'zB',
          matches: [
            {
              // Same numeric position (1) as zA's match, in a different zone.
              matchId: 'match-b-1',
              bracket: 'winners',
              round: 1,
              position: 1,
              status: 'scheduled',
              slots: [
                { kind: 'entrant', name: 'Team C' },
                { kind: 'entrant', name: 'Team D' },
              ],
            },
          ],
        },
      ],
    };

    const mapped = mapBracketResponse(response);
    const dependentSlot = mapped.zones[0]?.matches[1]?.slots[0];
    expect(dependentSlot).toMatchObject({ kind: 'winner-of', matchId: 'match-a-1', matchNumber: 1 });
  });

  it('maps an unresolved slot without a position or numeric matchId to an undefined matchNumber', () => {
    const response: PublicBracketResponse = {
      zones: [
        {
          matches: [
            {
              matchId: 'm9',
              bracket: 'winners',
              round: 2,
              position: 1,
              status: 'scheduled',
              slots: [{ kind: 'loser-of', matchId: 'not-a-position-reference' }],
            },
          ],
        },
      ],
    };

    const mapped = mapBracketResponse(response);
    expect(mapped.zones[0]?.matches[0]?.slots[0]).toMatchObject({
      kind: 'loser-of',
      matchId: 'not-a-position-reference',
    });
    expect(mapped.zones[0]?.matches[0]?.slots[0]).not.toHaveProperty('matchNumber');
  });

  it('names an entrant with no published name as TBD rather than an empty label', () => {
    const response: PublicBracketResponse = {
      zones: [
        {
          matches: [
            {
              matchId: 'm1',
              bracket: 'winners',
              round: 1,
              position: 1,
              status: 'scheduled',
              slots: [{ kind: 'entrant', entrantId: 'e1' }],
            },
          ],
        },
      ],
    };

    const mapped = mapBracketResponse(response);
    expect(mapped.zones[0]?.matches[0]?.slots[0]).toMatchObject({ kind: 'entrant', name: 'TBD' });
  });
});
