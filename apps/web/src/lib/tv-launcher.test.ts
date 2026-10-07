import { describe, expect, it } from '@jest/globals';
import { buildTvLauncherDestination, parseTvLauncherPreset } from './tv-launcher.js';

describe('buildTvLauncherDestination', () => {
  it('builds a pinned match destination and retains display options', () => {
    expect(
      buildTvLauncherDestination({
        organization: 'liga-norte',
        tournament: 'copa-2026',
        view: 'matches',
        background: 'court',
        language: 'es',
        stage: 2,
        match: 7,
      }),
    ).toBe('/tv/liga-norte/tournaments/copa-2026/stages/2/matches/7?lang=es&bg=court');
  });

  it('sets overlay presentation while preserving selected background', () => {
    expect(
      buildTvLauncherDestination({
        organization: 'liga-norte',
        tournament: 'copa-2026',
        view: 'overlay',
        background: 'chroma',
        language: 'en',
      }),
    ).toContain('mode=overlay');
  });
});

describe('parseTvLauncherPreset', () => {
  const validPreset = {
    organization: 'liga-norte',
    tournament: 'copa-2026',
    view: 'matches',
    background: 'court',
    language: 'es',
    stage: 2,
    match: 7,
  };

  it('restores a valid pinned match preset', () => {
    expect(parseTvLauncherPreset(validPreset)).toEqual(validPreset);
  });

  it.each([
    { ...validPreset, organization: '../admin' },
    { ...validPreset, background: 'transparent' },
    { ...validPreset, language: 'xx' },
    { ...validPreset, match: 0 },
    null,
  ])('rejects malformed or unsupported preset %#', (preset) => {
    expect(parseTvLauncherPreset(preset)).toBeUndefined();
  });
});
