import { describe, expect, it } from '@jest/globals';
import {
  buildTvLauncherDestination,
  defaultBackgroundFor,
  defaultStage,
  formatKickoff,
  gridFromParams,
  launcherStateLabels,
  matchOptionGroups,
  openingStage,
  parseTvLauncherPreset,
  viewFromParams,
  type TvLauncherDestination,
  type TvLauncherMatchChoice,
  type TvLauncherOptionText,
} from './tv-launcher.js';

const base = {
  organization: 'panamericano-demo',
  tournament: 'panamericano-clubes-2025',
  background: 'discipline',
  language: 'es',
} as const;
const root = '/tv/panamericano-demo/tournaments/panamericano-clubes-2025';

const destination = (input: Partial<TvLauncherDestination>): string =>
  buildTvLauncherDestination({ ...base, view: 'kiosk', ...input });

const text: TvLauncherOptionText = {
  state: { live: 'En vivo', upcoming: 'Programado', final: 'Finalizado' },
  delayed: 'Demorado',
  when: (scheduledAt) => formatKickoff(scheduledAt, 'es', 'America/Argentina/Buenos_Aires'),
};

function choice(overrides: Partial<TvLauncherMatchChoice> = {}): TvLauncherMatchChoice {
  return {
    stage: 2,
    stageName: 'Copas',
    match: 5,
    scope: 'Copa Oro · Semifinal',
    zone: 'Copa Oro',
    home: 'Casa de Italia',
    away: 'Richet y Zapata',
    venue: 'Aldo Cantoni',
    state: 'upcoming',
    scheduledAt: '2026-11-23T16:00:00.000Z',
    ...overrides,
  };
}

describe('buildTvLauncherDestination', () => {
  it('builds the rotating kiosk without a layout or a view parameter', () => {
    expect(destination({})).toBe(`${root}?lang=es&bg=discipline`);
  });

  it('writes the presentation and dashboard layouts and the court grid, with its size', () => {
    expect(destination({ view: 'presentation' })).toContain('layout=presentation');
    expect(destination({ view: 'dashboardLayout' })).toContain('layout=dashboard');
    expect(destination({ view: 'multicourt', grid: 4 })).toContain('grid=4');
    expect(destination({ view: 'multicourt', grid: 'auto' })).not.toContain('grid=');
  });

  it('writes the standings and the match list as view values', () => {
    expect(destination({ view: 'standings' })).toContain('view=standings');
    expect(destination({ view: 'matches' })).toContain('view=matches');
  });

  it('writes each overlay as its own mode, on a transparent ground', () => {
    for (const mode of ['overlay-scorebug', 'overlay-lower', 'overlay-full'] as const) {
      const link = destination({ view: mode, background: 'transparent', court: 'Cancha 1' });
      expect(link).toContain(`mode=${mode}`);
      expect(link).toContain('bg=transparent');
    }
  });

  it('accepts transparent as a background', () => {
    expect(destination({ view: 'overlay-lower', background: 'transparent' })).toContain(
      'bg=transparent',
    );
  });

  it('pins a match in the path for the pinned kiosk and for an overlay', () => {
    expect(destination({ view: 'match', stage: 2, match: 5 })).toBe(
      `${root}/stages/2/matches/5?lang=es&bg=discipline`,
    );
    expect(destination({ view: 'overlay-lower', stage: 2, match: 5 })).toContain(
      `${root}/stages/2/matches/5?`,
    );
  });

  it('writes a court only where no match is pinned, so the two never meet', () => {
    const followed = destination({ view: 'overlay-lower', court: 'Cancha 1' });
    expect(followed).toContain('court=Cancha+1');
    const pinned = destination({ view: 'overlay-lower', stage: 2, match: 5, court: 'Cancha 1' });
    expect(pinned).not.toContain('court=');
    expect(destination({ view: 'kiosk', court: 'Cancha 1' })).not.toContain('court=');
  });
});

describe('parseTvLauncherPreset', () => {
  const stored = (input: Record<string, unknown>) =>
    parseTvLauncherPreset({ ...base, view: 'kiosk', ...input });

  it('accepts a transparent background in a stored preset', () => {
    expect(stored({ view: 'overlay-lower', background: 'transparent' })?.background).toBe(
      'transparent',
    );
  });

  it('reads a stored rotating dashboard as the kiosk, and a stored overlay as the corner bug', () => {
    expect(stored({ view: 'dashboard' })?.view).toBe('kiosk');
    expect(stored({ view: 'overlay', court: 'Cancha 1' })?.view).toBe('overlay-scorebug');
  });

  it('keeps a stored court only for an overlay, and never beside a pinned match', () => {
    expect(stored({ view: 'overlay-full', court: 'Cancha 1' })?.court).toBe('Cancha 1');
    expect(stored({ view: 'kiosk', court: 'Cancha 1' })?.court).toBeUndefined();
    const pinned = stored({ view: 'overlay-full', stage: 2, match: 5, court: 'Cancha 1' });
    expect(pinned?.court).toBeUndefined();
    expect(pinned?.match).toBe(5);
  });

  it('keeps a stored grid size, and drops an unknown one', () => {
    expect(stored({ view: 'multicourt', grid: 6 })?.grid).toBe(6);
    expect(stored({ view: 'multicourt', grid: 5 })?.grid).toBeUndefined();
  });

  it('rejects a pinned match without its ordinals, and an unknown view', () => {
    expect(stored({ view: 'match' })).toBeUndefined();
    expect(stored({ view: 'unknown' })).toBeUndefined();
  });

  it('reads the legacy matches view with a stage and a match as the pinned match', () => {
    expect(stored({ view: 'matches', stage: 1, match: 3 })?.view).toBe('match');
  });
});

describe('viewFromParams', () => {
  it('opens each overlay from its mode, and the old bare overlay as the corner bug', () => {
    expect(viewFromParams(new URLSearchParams('mode=overlay-lower'))).toBe('overlay-lower');
    expect(viewFromParams(new URLSearchParams('mode=overlay-full'))).toBe('overlay-full');
    expect(viewFromParams(new URLSearchParams('mode=overlay'))).toBe('overlay-scorebug');
  });

  it('opens the full-frame layouts, the standings and the list, and the pinned match', () => {
    expect(viewFromParams(new URLSearchParams('layout=presentation'))).toBe('presentation');
    expect(viewFromParams(new URLSearchParams('layout=dashboard'))).toBe('dashboardLayout');
    expect(viewFromParams(new URLSearchParams('layout=multicourt'))).toBe('multicourt');
    expect(viewFromParams(new URLSearchParams('view=standings'))).toBe('standings');
    expect(viewFromParams(new URLSearchParams('view=fixtures'))).toBe('matches');
    expect(viewFromParams(new URLSearchParams('view=matches&stage=1&match=2'))).toBe('match');
  });

  it('opens the rotating kiosk when the address names no view', () => {
    expect(viewFromParams(new URLSearchParams(''))).toBe('kiosk');
    expect(viewFromParams(new URLSearchParams('view=dashboard'))).toBe('kiosk');
  });

  it('reads the grid size, and falls back to automatic', () => {
    expect(gridFromParams(new URLSearchParams('grid=4'))).toBe(4);
    expect(gridFromParams(new URLSearchParams('grid=9'))).toBe('auto');
  });

  it('starts an overlay on transparent and every other view on the discipline ground', () => {
    expect(defaultBackgroundFor('overlay-scorebug')).toBe('transparent');
    expect(defaultBackgroundFor('overlay-full')).toBe('discipline');
    expect(defaultBackgroundFor('kiosk')).toBe('discipline');
  });
});

describe('matchOptionGroups', () => {
  it('reads an option with its round, sides, kickoff in the organization zone, court and state', () => {
    const [group] = matchOptionGroups([choice()], 2, text);
    expect(group?.heading).toBe('Copa Oro');
    expect(group?.options[0]?.label).toBe(
      'Copa Oro · Semifinal · Casa de Italia — Richet y Zapata · lun, 23/11, 13:00 · Aldo Cantoni · Programado · #5',
    );
  });

  it('reads a delayed match with the delayed word, and a live one with the live word', () => {
    const delayed = matchOptionGroups([choice({ delayed: true })], 2, text)[0]?.options[0]?.label;
    expect(delayed).toContain('Demorado');
    const live = matchOptionGroups([choice({ state: 'live' })], 2, text)[0]?.options[0]?.label;
    expect(live).toContain('En vivo');
  });

  it('leaves out the parts a match does not have and keeps the number last', () => {
    const plain = matchOptionGroups(
      [choice({ scope: undefined, venue: undefined, scheduledAt: undefined })],
      2,
      text,
    )[0]?.options[0]?.label;
    expect(plain).toBe('Casa de Italia — Richet y Zapata · Programado · #5');
  });

  it('shows only the stage it is asked for', () => {
    expect(matchOptionGroups([choice({ stage: 1 })], 2, text)).toEqual([]);
  });
});

describe('defaultStage', () => {
  const now = Date.parse('2026-11-23T16:30:00.000Z');

  it('opens on the stage of the live match first', () => {
    expect(
      defaultStage(
        [choice({ stage: 1, state: 'upcoming' }), choice({ stage: 3, state: 'live' })],
        now,
      ),
    ).toBe(3);
  });

  it('else on the stage of the next scheduled match that is not delayed', () => {
    expect(
      defaultStage(
        [
          choice({ stage: 1, scheduledAt: '2026-11-23T15:00:00.000Z' }),
          choice({ stage: 2, scheduledAt: '2026-11-23T18:00:00.000Z' }),
          choice({ stage: 4, state: 'final' }),
        ],
        now,
      ),
    ).toBe(2);
  });

  it('else on the last stage when every match is finished', () => {
    expect(
      defaultStage(
        [
          choice({ stage: 1, state: 'final' }),
          choice({ stage: 2, state: 'final', scheduledAt: undefined }),
        ],
        now,
      ),
    ).toBe(2);
  });
});

describe('formatKickoff', () => {
  it('formats the day and time in the organization zone, not the viewer zone', () => {
    expect(formatKickoff('2026-11-23T16:00:00.000Z', 'es', 'America/Argentina/Buenos_Aires')).toBe(
      'lun, 23/11, 13:00',
    );
  });

  it('reads nothing for an unreadable timestamp', () => {
    expect(formatKickoff('not a date', 'es')).toBe('');
  });
});

describe('the launcher form keeps the chosen view across a tournament switch', () => {
  it('reads every view name the form submits', () => {
    for (const view of [
      'overlay-lower',
      'overlay-full',
      'overlay-scorebug',
      'presentation',
      'dashboardLayout',
      'multicourt',
      'standings',
      'matches',
      'kiosk',
    ]) {
      expect(viewFromParams(new URLSearchParams({ view }))).toBe(view);
    }
  });

  it('keeps the legacy names: dashboard reads as the kiosk, overlay as the corner bug', () => {
    expect(viewFromParams(new URLSearchParams('view=dashboard'))).toBe('kiosk');
    expect(viewFromParams(new URLSearchParams('view=overlay'))).toBe('overlay-scorebug');
  });

  it('keeps overlay-lower and the grid size when the tournament changes', () => {
    const submitted = new URLSearchParams({
      organization: 'panamericano-demo',
      tournament: 'other-tournament',
      view: 'overlay-lower',
      grid: '4',
      bg: 'transparent',
    });
    expect(viewFromParams(submitted)).toBe('overlay-lower');
    expect(gridFromParams(submitted)).toBe(4);
  });
});

describe('openingStage', () => {
  const now = Date.parse('2026-11-23T16:30:00.000Z');
  const choices = [choice({ stage: 1 }), choice({ stage: 2, state: 'final' })];

  it('opens on the requested stage when the tournament has it', () => {
    expect(openingStage(choices, 1, now)).toBe(1);
  });

  it('opens on the default stage when the requested stage belongs to another tournament', () => {
    expect(openingStage(choices, 7, now)).toBe(2);
    expect(openingStage(choices, undefined, now)).toBe(2);
  });

  it('has no stage when the tournament has no matches', () => {
    expect(openingStage([], 3, now)).toBeUndefined();
  });
});

describe('match state words', () => {
  const labels = { live: 'En vivo', upcoming: 'Programado', final: 'Finalizado' };
  const words = {
    ...labels,
    disputed: 'En disputa',
    winner: 'Ganador',
    loser: 'Perdedor',
    tbd: 'A definir',
    cancelled: 'Cancelado',
  };

  it('names a disputed and a cancelled match with their own words, never the code', () => {
    const disputed = matchOptionGroups([choice({ state: 'disputed' })], 2, {
      ...text,
      state: words,
    })[0]?.options[0]?.label;
    expect(disputed).toContain('En disputa');
    const cancelled = matchOptionGroups([choice({ state: 'cancelled' })], 2, {
      ...text,
      state: words,
    })[0]?.options[0]?.label;
    expect(cancelled).toContain('Cancelado');
    expect(cancelled).not.toContain('cancelled');
  });

  it('omits the state from an option whose state has no word, instead of printing the code', () => {
    const label = matchOptionGroups([choice({ state: 'disputed' })], 2, {
      ...text,
      state: labels,
    })[0]?.options[0]?.label;
    expect(label).toBe(
      'Copa Oro · Semifinal · Casa de Italia — Richet y Zapata · lun, 23/11, 13:00 · Aldo Cantoni · #5',
    );
  });

  it('builds the words from the catalogue keys, and omits what the catalogue lacks', () => {
    const built = launcherStateLabels({
      optionLive: 'En vivo',
      optionCancelled: 'Cancelado',
      optionDisputed: '',
    });
    expect(built).toEqual({ live: 'En vivo', cancelled: 'Cancelado' });
  });
});
