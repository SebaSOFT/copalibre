import { describe, expect, it } from '@jest/globals';
import {
  buildTvLauncherDestination,
  matchOptionGroups,
  parseTvLauncherPreset,
  courtOptions,
  stageOptionLabel,
  stageOptions,
  viewShowsMatch,
  type TvLauncherMatchChoice,
} from './tv-launcher.js';
import { TV_LAUNCHER_LABELS } from './tv-launcher-labels.js';

const base = {
  organization: 'liga-norte',
  tournament: 'copa-2026',
  background: 'court',
  language: 'es',
} as const;

describe('buildTvLauncherDestination', () => {
  it('builds a pinned match destination and retains display options', () => {
    expect(buildTvLauncherDestination({ ...base, view: 'match', stage: 2, match: 7 })).toBe(
      '/tv/liga-norte/tournaments/copa-2026/stages/2/matches/7?lang=es&bg=court',
    );
  });

  it('sets overlay presentation while preserving selected background', () => {
    expect(
      buildTvLauncherDestination({
        ...base,
        view: 'overlay',
        background: 'chroma',
        language: 'en',
      }),
    ).toBe('/tv/liga-norte/tournaments/copa-2026?lang=en&bg=chroma&mode=overlay');
  });

  it('pins an overlay to its explicit match, so two overlays can show two matches', () => {
    const first = buildTvLauncherDestination({ ...base, view: 'overlay', stage: 1, match: 3 });
    const second = buildTvLauncherDestination({ ...base, view: 'overlay', stage: 1, match: 4 });

    expect(first).toBe(
      '/tv/liga-norte/tournaments/copa-2026/stages/1/matches/3?lang=es&bg=court&mode=overlay',
    );
    expect(second).not.toBe(first);
  });

  it('follows a court: an overlay with a court and no match names the court', () => {
    expect(buildTvLauncherDestination({ ...base, view: 'overlay', court: 'Cancha 2' })).toBe(
      '/tv/liga-norte/tournaments/copa-2026?lang=es&bg=court&mode=overlay&court=Cancha+2',
    );
  });

  it('prefers a pinned match to a court, and ignores a court on any other view', () => {
    expect(
      buildTvLauncherDestination({
        ...base,
        view: 'overlay',
        stage: 1,
        match: 3,
        court: 'Cancha 2',
      }),
    ).not.toContain('court=');
    expect(
      buildTvLauncherDestination({ ...base, view: 'dashboard', court: 'Cancha 2' }),
    ).not.toContain('court=');
  });

  it('names the kiosk view in the address: standings and the match list', () => {
    expect(buildTvLauncherDestination({ ...base, view: 'standings' })).toContain('view=standings');
    expect(buildTvLauncherDestination({ ...base, view: 'matches', stage: 2, match: 7 })).toBe(
      '/tv/liga-norte/tournaments/copa-2026?lang=es&bg=court&view=matches',
    );
  });

  it('does not pin a match for the rotating dashboard', () => {
    expect(buildTvLauncherDestination({ ...base, view: 'dashboard', stage: 2, match: 7 })).toBe(
      '/tv/liga-norte/tournaments/copa-2026?lang=es&bg=court',
    );
  });
});

describe('viewShowsMatch', () => {
  it('asks for a match for the pinned view and for the overlay only', () => {
    expect(
      ['dashboard', 'standings', 'matches', 'match', 'overlay'].filter(viewShowsMatch),
    ).toEqual(['match', 'overlay']);
  });
});

describe('parseTvLauncherPreset', () => {
  const validPreset = { ...base, view: 'match', stage: 2, match: 7 };

  it('restores a valid pinned match preset', () => {
    expect(parseTvLauncherPreset(validPreset)).toEqual(validPreset);
  });

  it('restores an overlay with or without a pinned match', () => {
    expect(parseTvLauncherPreset({ ...base, view: 'overlay', stage: 1, match: 3 })).toEqual({
      ...base,
      view: 'overlay',
      stage: 1,
      match: 3,
    });
    expect(parseTvLauncherPreset({ ...base, view: 'overlay' })).toEqual({
      ...base,
      view: 'overlay',
    });
  });

  it('restores an overlay’s court, and drops a court from any other view', () => {
    expect(parseTvLauncherPreset({ ...base, view: 'overlay', court: 'Cancha 2' })?.court).toBe(
      'Cancha 2',
    );
    expect(parseTvLauncherPreset({ ...validPreset, court: 'Cancha 2' })?.court).toBeUndefined();
    expect(parseTvLauncherPreset({ ...base, view: 'overlay', court: '' })?.court).toBeUndefined();
  });

  it('reads a preset saved when `matches` meant the pinned match as `match`', () => {
    expect(parseTvLauncherPreset({ ...validPreset, view: 'matches' })?.view).toBe('match');
    expect(parseTvLauncherPreset({ ...base, view: 'matches' })).toEqual({
      ...base,
      view: 'matches',
    });
  });

  it.each([
    { ...validPreset, organization: '../admin' },
    { ...validPreset, background: 'transparent' },
    { ...validPreset, language: 'xx' },
    { ...validPreset, match: 0 },
    { ...base, view: 'match' },
    null,
  ])('rejects malformed or unsupported preset %#', (preset) => {
    expect(parseTvLauncherPreset(preset)).toBeUndefined();
  });
});

describe('stages and match options', () => {
  const choice = (
    overrides: Partial<TvLauncherMatchChoice> & Pick<TvLauncherMatchChoice, 'stage' | 'match'>,
  ): TvLauncherMatchChoice => ({
    stageName: overrides.stage === 1 ? 'Fase de grupos' : 'Copas',
    home: 'Lomas',
    away: 'Hispano',
    ...overrides,
  });
  const choices = [
    choice({ stage: 2, match: 1, zone: 'Copa Oro', round: 1 }),
    choice({ stage: 1, match: 1, zone: 'Grupos', group: 'Grupo A', round: 1 }),
    choice({ stage: 1, match: 2, zone: 'Grupos', group: 'Grupo B', round: 1, home: 'UVT' }),
    choice({ stage: 1, match: 3, zone: 'Grupos', group: 'Grupo A', round: 2 }),
  ];

  it('labels a stage with its number and name, and with the number alone when it has no name', () => {
    expect(stageOptionLabel({ stage: 2, stageName: 'Copas' })).toBe('2 · Copas');
    expect(stageOptionLabel({ stage: 2, stageName: '' })).toBe('2');
  });

  it('lists the venues once each, in alphabetical order, for an overlay that follows a court', () => {
    expect(
      courtOptions([
        choice({ stage: 1, match: 1, venue: 'Cancha 2' }),
        choice({ stage: 1, match: 2, venue: 'Cancha 1' }),
        choice({ stage: 1, match: 3, venue: 'Cancha 2' }),
        choice({ stage: 1, match: 4 }),
      ]),
    ).toEqual(['Cancha 1', 'Cancha 2']);
  });

  it('lists each stage once, in stage order', () => {
    expect(stageOptions(choices)).toEqual([
      { stage: 1, label: '1 · Fase de grupos' },
      { stage: 2, label: '2 · Copas' },
    ]);
  });

  it('groups the matches of a stage by zone and group, each with round, names and identifier', () => {
    const groups = matchOptionGroups(choices, 1, 'Ronda');

    expect(groups.map((group) => group.heading)).toEqual(['Grupos · Grupo A', 'Grupos · Grupo B']);
    expect(groups[0]?.options).toEqual([
      { match: 1, label: 'Ronda 1 · Lomas — Hispano · #1' },
      { match: 3, label: 'Ronda 2 · Lomas — Hispano · #3' },
    ]);
    expect(groups[1]?.options[0]?.label).toBe('Ronda 1 · UVT — Hispano · #2');
  });

  it('keeps a match with no zone or group under one unnamed heading', () => {
    const groups = matchOptionGroups([choice({ stage: 1, match: 5 })], 1, 'Round');
    expect(groups).toEqual([
      { heading: '', options: [{ match: 5, label: 'Lomas — Hispano · #5' }] },
    ]);
  });
});

describe('TV_LAUNCHER_LABELS', () => {
  const languages = Object.keys(TV_LAUNCHER_LABELS);
  const english = Object.keys(TV_LAUNCHER_LABELS.en);

  it('has every label in all eight languages', () => {
    expect(languages.sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'zh']);
    for (const language of languages) {
      const labels = TV_LAUNCHER_LABELS[language as keyof typeof TV_LAUNCHER_LABELS];
      expect(Object.keys(labels).sort()).toEqual([...english].sort());
      for (const text of Object.values(labels)) expect(text.trim()).not.toBe('');
    }
  });
});
