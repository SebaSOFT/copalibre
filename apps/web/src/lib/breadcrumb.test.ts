import { describe, expect, it } from '@jest/globals';
import { collapsedRange, publicTrail, trailBaseOf } from './breadcrumb.ts';

const base = trailBaseOf({
  organizationAlias: 'panamericano-demo',
  organizationName: 'Panamericano Demo',
  tournamentName: 'Campeonato Panamericano',
  canonicalPath: '/panamericano-demo/tournaments/clubes-2025',
  localePrefix: '/es',
});

describe('trailBaseOf', () => {
  it('keeps every route inside the current locale', () => {
    expect(base.organizationPath).toBe('/es/panamericano-demo');
    expect(base.tournamentPath).toBe('/es/panamericano-demo/tournaments/clubes-2025');
  });

  it('adds no prefix for the primary locale and encodes the alias', () => {
    expect(
      trailBaseOf({
        organizationAlias: 'liga uno',
        organizationName: 'Liga',
        tournamentName: 'Copa',
        canonicalPath: '/liga-uno/tournaments/copa',
        localePrefix: '',
      }).organizationPath,
    ).toBe('/liga%20uno');
  });
});

describe('publicTrail', () => {
  it('links every ancestor and leaves the current page as plain text', () => {
    const trail = publicTrail(base, [
      { label: 'Partidos', href: `${base.tournamentPath}/matches?stageNumber=2` },
      { label: 'Fase 2', href: `${base.tournamentPath}/stages/2` },
      { label: 'Ronda 1 · Partido 2' },
    ]);

    expect(trail.map((item) => item.label)).toEqual([
      'Panamericano Demo',
      'Campeonato Panamericano',
      'Partidos',
      'Fase 2',
      'Ronda 1 · Partido 2',
    ]);
    expect(trail.slice(0, -1).every((item) => item.href?.startsWith('/es/'))).toBe(true);
    expect(trail.at(-1)?.href).toBeUndefined();
  });

  it('makes the tournament the current page when nothing follows it', () => {
    const trail = publicTrail(base, []);

    expect(trail).toHaveLength(2);
    expect(trail[0]?.href).toBe('/es/panamericano-demo');
    expect(trail[1]).toEqual({ label: 'Campeonato Panamericano' });
  });

  it('drops a link on the last item even when the caller supplied one', () => {
    const trail = publicTrail(base, [{ label: 'En vivo', href: '/ignored' }]);

    expect(trail.at(-1)).toEqual({ label: 'En vivo' });
  });
});

describe('collapsedRange', () => {
  it('never collapses a trail of three or fewer', () => {
    expect(collapsedRange(2)).toBeUndefined();
    expect(collapsedRange(3)).toBeUndefined();
  });

  it('keeps the first and the last two, folding the middle', () => {
    expect(collapsedRange(4)).toEqual({ from: 1, to: 1 });
    expect(collapsedRange(5)).toEqual({ from: 1, to: 2 });
  });
});
