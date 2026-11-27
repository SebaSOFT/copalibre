import { describe, expect, it } from '@jest/globals';
import { parseBracketRole, placementGroupRole } from './bracket-role.ts';

describe('parseBracketRole', () => {
  it('reads a single place and a range of places', () => {
    expect(parseBracketRole('place-3')).toEqual({ kind: 'place', place: 3 });
    expect(parseBracketRole('places-5-8')).toEqual({ kind: 'places', from: 5, to: 8 });
  });

  it('keeps a role it does not know, so it can still be shown', () => {
    expect(parseBracketRole('consolation-final')).toEqual({
      kind: 'other',
      code: 'consolation-final',
    });
  });

  it('reads the engine branch of a persisted graph', () => {
    expect(parseBracketRole('placement-7')).toEqual({ kind: 'place', place: 7 });
    expect(parseBracketRole(placementGroupRole('pl5', 2))).toEqual({
      kind: 'places',
      from: 5,
      to: 8,
    });
    expect(placementGroupRole('place-3', 1)).toBe('place-3');
  });
});
