import {
  PRIMARY_LOCALE,
  RouteError,
  buildRobots,
  buildSitemap,
  controlPath,
  homePath,
  publicPath,
  publicStreamPath,
  resolveAlias,
  tvPath,
  tvStreamPath,
  viewQuery,
  type AliasRedirect,
} from './index.js';

const BASE = { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026' };

describe('canonical public paths', () => {
  it.each([
    [{ organizationAlias: 'liga-mendocina' }, '/liga-mendocina'],
    [BASE, '/liga-mendocina/tournaments/apertura-2026'],
    [{ ...BASE, stageNumber: 2 }, '/liga-mendocina/tournaments/apertura-2026/stages/2'],
    [
      { ...BASE, stageNumber: 2, matchNumber: 7 },
      '/liga-mendocina/tournaments/apertura-2026/stages/2/matches/7',
    ],
    [
      { ...BASE, participantAlias: 'casa-de-italia' },
      '/liga-mendocina/tournaments/apertura-2026/participants/casa-de-italia',
    ],
  ])('builds %j', (input, expected) => {
    expect(publicPath(input)).toBe(expected);
  });

  it('has a home', () => {
    expect(homePath()).toBe('/');
  });
});

describe('every surface from one input', () => {
  it('derives control, TV and the stream by prefix, not by hand', () => {
    // Three call sites assembling the same path is three chances to drop a
    // segment, and the surfaces then disagree about what a match is called.
    expect(controlPath(BASE)).toBe('/control/liga-mendocina/tournaments/apertura-2026');
    expect(tvPath(BASE)).toBe('/tv/liga-mendocina/tournaments/apertura-2026');
    expect(publicStreamPath(BASE)).toBe('/events/public/liga-mendocina/tournaments/apertura-2026');
  });

  it('pins the TV path to one match by number, never by id', () => {
    expect(tvPath({ ...BASE, stageNumber: 1, matchNumber: 5 })).toBe(
      '/tv/liga-mendocina/tournaments/apertura-2026/stages/1/matches/5',
    );
  });

  it('keeps the locale prefix out of control and TV paths', () => {
    expect(controlPath({ ...BASE, locale: 'es' })).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026',
    );
  });

  it('refuses a stream that names no tournament', () => {
    expect(() => publicStreamPath({ organizationAlias: 'liga-mendocina' })).toThrow(RouteError);
  });

  it('derives the TV stream the same way as the TV page (0031)', () => {
    expect(tvStreamPath(BASE)).toBe('/events/tv/liga-mendocina/tournaments/apertura-2026');
  });

  it('refuses a TV stream that names no tournament', () => {
    expect(() => tvStreamPath({ organizationAlias: 'liga-mendocina' })).toThrow(RouteError);
  });
});

describe('what a URL may not contain', () => {
  it('refuses a UUID where an alias belongs', () => {
    // A URL is read aloud, typed from a poster and pasted into a message.
    expect(() => publicPath({ organizationAlias: '019fbdac-f248-73f9-97e8-7f06ece633d2' })).toThrow(
      /read aloud/,
    );
  });

  it.each(['Liga', 'liga_mendocina', 'liga mendocina', 'liga--x', '-liga'])(
    'refuses "%s" as an alias',
    (alias) => {
      expect(() => publicPath({ organizationAlias: alias })).toThrow(RouteError);
    },
  );

  it.each([0, -1, 1.5])('refuses %s as a scoped number', (stageNumber) => {
    expect(() => publicPath({ ...BASE, stageNumber })).toThrow(RouteError);
  });

  it('refuses a segment whose parent is missing', () => {
    expect(() => publicPath({ organizationAlias: 'liga-mendocina', stageNumber: 1 })).toThrow(
      /belongs to a tournament/,
    );
    expect(() => publicPath({ ...BASE, matchNumber: 3 })).toThrow(/belongs to a stage/);
  });
});

describe('locale', () => {
  it('omits the prefix for the primary locale', () => {
    expect(publicPath({ ...BASE, locale: PRIMARY_LOCALE })).toBe(publicPath(BASE));
    expect(homePath(PRIMARY_LOCALE)).toBe('/');
  });

  it('prefixes every other locale', () => {
    expect(publicPath({ ...BASE, locale: 'es' })).toBe(
      '/es/liga-mendocina/tournaments/apertura-2026',
    );
    expect(homePath('pt-BR')).toBe('/pt-BR');
  });

  it('refuses something that is not a locale tag', () => {
    expect(() => publicPath({ ...BASE, locale: 'español' })).toThrow(RouteError);
  });
});

describe('view state is a query, never a path', () => {
  it('puts mode and filters in the query string', () => {
    // A path is an identity; a query is a way of looking at it. A filter in the
    // path mints a second canonical URL for one resource.
    expect(viewQuery({ viewMode: 'broadcast', filters: { stage: 'finals' } })).toBe(
      '?mode=broadcast&stage=finals',
    );
  });

  it('says nothing for the default view', () => {
    expect(viewQuery({ viewMode: 'default' })).toBe('');
    expect(viewQuery({})).toBe('');
  });

  it('carries the TV overlay mode for chroma-key capture (0031)', () => {
    expect(viewQuery({ viewMode: 'overlay' })).toBe('?mode=overlay');
  });
});

describe('a renamed alias', () => {
  const current = new Set(['clausura-2026']);
  const redirects: readonly AliasRedirect[] = [
    { organizationId: 'org-1', oldAlias: 'apertura-2026', newAlias: 'clausura-2026' },
    { organizationId: 'org-2', oldAlias: 'apertura-2026', newAlias: 'otra-cosa' },
  ];

  it('redirects permanently to the canonical alias', () => {
    // The old URL is on a poster, in a WhatsApp message and on a federation
    // page; 404 there is all three pointing at nothing.
    expect(resolveAlias('org-1', 'apertura-2026', current, redirects)).toEqual({
      kind: 'redirect',
      to: 'clausura-2026',
      status: 301,
    });
  });

  it('says nothing about a current alias', () => {
    expect(resolveAlias('org-1', 'clausura-2026', current, redirects)).toEqual({ kind: 'current' });
  });

  it('never resolves across organizations', () => {
    // Two organizations both used "apertura"; crossing them hands a spectator
    // somebody else's competition.
    expect(resolveAlias('org-3', 'apertura-2026', current, redirects)).toEqual({ kind: 'unknown' });
  });

  it('follows a chain of renames', () => {
    const chain: readonly AliasRedirect[] = [
      { organizationId: 'org-1', oldAlias: 'a', newAlias: 'b' },
      { organizationId: 'org-1', oldAlias: 'b', newAlias: 'c' },
    ];

    expect(resolveAlias('org-1', 'a', new Set(['c']), chain)).toMatchObject({ to: 'c' });
  });

  it('gives up on a cycle rather than looping', () => {
    const cycle: readonly AliasRedirect[] = [
      { organizationId: 'org-1', oldAlias: 'a', newAlias: 'b' },
      { organizationId: 'org-1', oldAlias: 'b', newAlias: 'a' },
    ];

    expect(resolveAlias('org-1', 'a', new Set(['z']), cycle)).toEqual({ kind: 'unknown' });
  });

  it('is unknown when nothing matches', () => {
    expect(resolveAlias('org-1', 'nunca-existio', current, redirects)).toEqual({ kind: 'unknown' });
  });
});

describe('what a crawler is told', () => {
  const sitemap = buildSitemap('https://copalibre.test/', [
    { input: BASE, lastModified: '2026-08-01', changeFrequency: 'hourly' },
    { input: { ...BASE, stageNumber: 1 } },
  ]);

  it('lists public routes with the origin', () => {
    expect(sitemap).toContain(
      '<loc>https://copalibre.test/liga-mendocina/tournaments/apertura-2026</loc>',
    );
    expect(sitemap).toContain('<lastmod>2026-08-01</lastmod>');
  });

  it('cannot contain an operator or venue route, because the builder cannot make one', () => {
    expect(sitemap).not.toContain('/control/');
    expect(sitemap).not.toContain('/tv/');
  });

  it('disallows the non-public surfaces by name as well', () => {
    const robots = buildRobots('https://copalibre.test');

    expect(robots).toContain('Disallow: /control/');
    expect(robots).toContain('Disallow: /tv/');
    expect(robots).toContain('Sitemap: https://copalibre.test/sitemap.xml');
  });

  it('escapes what it interpolates', () => {
    expect(buildSitemap('https://x.test', [{ input: BASE, lastModified: '<bad>' }])).toContain(
      '&lt;bad&gt;',
    );
  });
});
