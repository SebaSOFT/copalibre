import {
  buildOverview,
  displayName,
  groupStandingsByZone,
  shortLabel,
  shouldShowChampionPodium,
} from './overview.js';
import { PUBLIC_ROUTES } from './public-routes.js';
import { sampleOverview } from './sample-data.js';

const model = buildOverview(sampleOverview('liga-mendocina', 'apertura-2026'));

describe('the overview model', () => {
  it('derives its own canonical path and its stream from one input', () => {
    // A page cannot subscribe to a stream for something else.
    expect(model.canonicalPath).toBe('/liga-mendocina/tournaments/apertura-2026');
    expect(model.streamPath).toBe('/events/public/liga-mendocina/tournaments/apertura-2026');
  });

  it('composes the competition name rather than storing it', () => {
    expect(displayName(model)).toBe('Torneo Apertura 2026');
    expect(displayName({ ...model, seasonName: undefined })).toBe('Torneo Apertura');
  });

  it('omits the season entirely when a tournament has never named one', () => {
    const sample = sampleOverview('liga-mendocina', 'apertura-2026');
    const built = buildOverview({ ...sample, seasonName: undefined });

    expect('seasonName' in built).toBe(false);
    expect(displayName(built)).toBe('Torneo Apertura');
  });

  it('counts what is live, so the badge carries a number and not just a colour', () => {
    expect(model.liveCount).toBe(1);
  });

  it('shows the podium only for a finished overview with multiple resolved zones', () => {
    const champion = { entrantId: '01936f4a-2001-7000-8000-000000000001', name: 'Club A' };
    const zone = { zoneName: 'Gold', champion };
    expect(
      shouldShowChampionPodium({
        status: 'finished',
        winners: [zone, { ...zone, zoneName: 'Silver' }],
      }),
    ).toBe(true);
    expect(shouldShowChampionPodium({ status: 'finished', winners: [zone] })).toBe(false);
    expect(shouldShowChampionPodium({ status: 'live', winners: [zone, zone] })).toBe(false);
    expect(shouldShowChampionPodium({ status: 'finished', winners: [] })).toBe(false);
  });

  it('shows the abbreviation when there is one and the name when there is not', () => {
    // Never a truncation invented here.
    expect(shortLabel({ name: 'Talleres de Mendoza', abbreviation: 'TLL A' })).toBe('TLL A');
    expect(shortLabel({ name: 'Club Atlético San Martín' })).toBe('Club Atlético San Martín');
  });

  it('reports zero live when nothing is live', () => {
    const quiet = buildOverview({
      ...sampleOverview('liga-mendocina', 'apertura-2026'),
      matches: [],
      standings: [],
    });

    expect(quiet.liveCount).toBe(0);
    expect(quiet.matches).toEqual([]);
  });

  it('refuses to build a model for a raw identifier', () => {
    expect(() =>
      buildOverview({
        ...sampleOverview('liga-mendocina', 'apertura-2026'),
        organizationAlias: '019fbdac-f248-73f9-97e8-7f06ece633d2',
      }),
    ).toThrow();
  });

  it('omits standingsGrain for a stage declaring no series, and carries it through when declared', () => {
    expect('standingsGrain' in model).toBe(false);

    const seriesGrain = buildOverview({
      ...sampleOverview('liga-mendocina', 'apertura-2026'),
      standingsGrain: 'series',
    });
    expect(seriesGrain.standingsGrain).toBe('series');

    const matchGrain = buildOverview({
      ...sampleOverview('liga-mendocina', 'apertura-2026'),
      standingsGrain: 'match',
    });
    expect(matchGrain.standingsGrain).toBe('match');
  });
});

describe('what the sitemap advertises', () => {
  it('lists only routes the public builder can construct', () => {
    for (const entry of PUBLIC_ROUTES) {
      expect(entry.input.organizationAlias).toBeDefined();
      expect(JSON.stringify(entry)).not.toContain('control');
      expect(JSON.stringify(entry)).not.toContain('/tv');
    }
  });
});

describe('groupStandingsByZone', () => {
  const row = (name: string, zoneName?: string) => ({
    position: 1,
    name,
    played: 1,
    points: 3,
    ...(zoneName === undefined ? {} : { zoneName }),
  });

  it('keeps rows that name no zone together as one unnamed block', () => {
    const blocks = groupStandingsByZone([row('A'), row('B')]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.zoneName).toBeUndefined();
    expect(blocks[0]?.rows.map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('splits rows by zone in first-seen order and never mixes them', () => {
    const blocks = groupStandingsByZone([
      row('A1', 'Liga A'),
      row('B1', 'Liga B'),
      row('A2', 'Liga A'),
    ]);

    expect(blocks.map((block) => block.zoneName)).toEqual(['Liga A', 'Liga B']);
    expect(blocks[0]?.rows.map((r) => r.name)).toEqual(['A1', 'A2']);
    expect(blocks[1]?.rows.map((r) => r.name)).toEqual(['B1']);
  });

  it('returns nothing for no rows', () => {
    expect(groupStandingsByZone([])).toEqual([]);
  });
});
