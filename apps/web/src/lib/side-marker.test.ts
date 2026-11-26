import { describe, expect, it } from '@jest/globals';
import { sideMarkerOf } from './side-marker.js';

describe('sideMarkerOf', () => {
  it('shows the crest with the abbreviation beside it when the side has a crest', () => {
    expect(
      sideMarkerOf({ name: 'Club Andes', abbreviation: 'AND', crestSrc: '/crest.png' }),
    ).toEqual({
      kind: 'crest',
      src: '/crest.png',
      text: 'AND',
    });
  });

  it('shows the monogram tile alone when there is no crest and the abbreviation fits the tile', () => {
    expect(sideMarkerOf({ name: 'Club Andes', abbreviation: 'AND' })).toEqual({
      kind: 'monogram',
      abbreviation: 'AND',
    });
    expect(sideMarkerOf({ name: 'Club Andes', abbreviation: 'SIXXYZ' })).toEqual({
      kind: 'monogram',
      abbreviation: 'SIXXYZ',
    });
  });

  it('shows the generic icon with the side’s text when the monogram cannot be drawn', () => {
    expect(sideMarkerOf({ name: 'Club Andes' })).toEqual({ kind: 'icon-text', text: 'Club Andes' });
    expect(sideMarkerOf({ name: 'Club Andes', abbreviation: 'SEVENTY' })).toEqual({
      kind: 'icon-text',
      text: 'SEVENTY',
    });
    expect(sideMarkerOf({ name: 'Player hidden at their request' })).toEqual({
      kind: 'icon-text',
      text: 'Player hidden at their request',
    });
  });
});
