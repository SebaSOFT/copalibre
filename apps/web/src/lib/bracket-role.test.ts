import { describe, expect, it } from '@jest/globals';
import { parseBracketRole } from './bracket-role.ts';

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
});
