import { emblemMonogramStep } from './entrant-emblem.js';

describe('emblemMonogramStep', () => {
  it('sets one to three characters to the short step', () => {
    expect(emblemMonogramStep('C')).toBe('short');
    expect(emblemMonogramStep('CPC')).toBe('short');
  });

  it('steps four characters to medium, five to long and six to longest', () => {
    expect(emblemMonogramStep('TALL')).toBe('medium');
    expect(emblemMonogramStep('CUDB')).toBe('medium');
    expect(emblemMonogramStep('ESTSM')).toBe('long');
    expect(emblemMonogramStep('CCBAAA')).toBe('longest');
  });

  it('counts characters, not bytes, for accented abbreviations', () => {
    expect(emblemMonogramStep('ÑUÑO')).toBe('medium');
  });

  it('uses the shield for absent, empty or longer abbreviations without truncation', () => {
    expect(emblemMonogramStep(undefined)).toBeUndefined();
    expect(emblemMonogramStep('')).toBeUndefined();
    expect(emblemMonogramStep('PANAMER')).toBeUndefined();
  });
});
