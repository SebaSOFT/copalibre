import { emblemMonogramFit } from './entrant-emblem.js';

describe('emblemMonogramFit', () => {
  it('keeps abbreviations of one through four characters at figure size', () => {
    expect(emblemMonogramFit('CPC')).toBe('figure');
    expect(emblemMonogramFit('TALL')).toBe('figure');
  });

  it('steps five- and six-character abbreviations down one size', () => {
    expect(emblemMonogramFit('NORTE')).toBe('reduced');
    expect(emblemMonogramFit('RACING')).toBe('reduced');
  });

  it('uses the shield for absent or longer abbreviations without truncation', () => {
    expect(emblemMonogramFit(undefined)).toBeUndefined();
    expect(emblemMonogramFit('')).toBeUndefined();
    expect(emblemMonogramFit('PANAMER')).toBeUndefined();
  });
});
