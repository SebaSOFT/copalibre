import {
  buildOverview,
  displayName,
  groupStandingsByZone,
  overviewLeadFor,
  selectNowStripMatches,
  shortLabel,
  shouldShowChampionPodium,
  summarizeOverviewMatches,
  type OverviewMatch,
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

  it('chooses the overview lead from tournament state', () => {
    expect(overviewLeadFor('live')).toBe('now-strip');
    expect(overviewLeadFor('finished')).toBe('honour-board');
    expect(overviewLeadFor('upcoming')).toBe('schedule-preview');
    expect(overviewLeadFor(undefined)).toBe('schedule-preview');
  });

  it('carries the discipline name and the public venues it is given', () => {
    const venues = [
      { alias: 'olimpia', name: 'Olimpia', address: 'Av. Central 100', courtCount: 2 },
    ];
    const withFacts = buildOverview({
      ...sampleOverview('liga-mendocina', 'apertura-2026'),
      disciplineName: 'Hockey sobre patines',
      venues,
    });
    expect(withFacts.disciplineName).toBe('Hockey sobre patines');
    expect(withFacts.venues).toEqual(venues);
    expect(model).not.toHaveProperty('venues');
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

  it('bounds live, upcoming and latest-result summaries in kickoff order', () => {
    const match = (
      matchId: string,
      state: OverviewMatch['state'],
      startsAt: string,
      score?: number,
    ): OverviewMatch => ({
      matchId,
      stageNumber: 1,
      matchNumber: Number(matchId.replace('m', '')),
      state,
      startsAt,
      home: { name: 'Home', ...(score === undefined ? {} : { score }) },
      away: { name: 'Away', ...(score === undefined ? {} : { score: 1 }) },
    });
    const summary = summarizeOverviewMatches(
      [
        match('m1', 'upcoming', '2026-10-23T12:00:00Z'),
        match('m2', 'live', '2026-10-22T12:00:00Z'),
        match('m3', 'final', '2026-10-20T12:00:00Z', 1),
        match('m4', 'upcoming', '2026-10-21T12:00:00Z'),
        match('m5', 'final', '2026-10-19T12:00:00Z'),
        match('m6', 'final', '2026-10-21T12:00:00Z', 2),
      ],
      1,
      new Date('2026-10-21T11:00:00Z'),
    );

    expect(summary.live.map((one) => one.matchId)).toEqual(['m2']);
    expect(summary.delayed).toEqual([]);
    expect(summary.upcoming.map((one) => one.matchId)).toEqual(['m4']);
    expect(summary.latestResults.map((one) => one.matchId)).toEqual(['m6']);
  });

  it('keeps the default overview summary to four upcoming matches and four results', () => {
    const upcoming = Array.from({ length: 6 }, (_, index) => ({
      matchId: `upcoming-${index}`,
      stageNumber: 1,
      matchNumber: index + 1,
      state: 'upcoming' as const,
      startsAt: `2026-10-${String(21 + index).padStart(2, '0')}T12:00:00Z`,
      home: { name: 'Home' },
      away: { name: 'Away' },
    }));
    const results = Array.from({ length: 6 }, (_, index) => ({
      matchId: `final-${index}`,
      stageNumber: 1,
      matchNumber: index + 1,
      state: 'final' as const,
      startsAt: `2026-10-${String(15 + index).padStart(2, '0')}T12:00:00Z`,
      home: { name: 'Home', score: 2 },
      away: { name: 'Away', score: 1 },
    }));

    const summary = summarizeOverviewMatches(
      [...upcoming, ...results],
      4,
      new Date('2026-10-21T11:00:00Z'),
    );

    expect(summary.upcoming.map((one) => one.matchId)).toEqual([
      'upcoming-0',
      'upcoming-1',
      'upcoming-2',
      'upcoming-3',
    ]);
    expect(summary.latestResults.map((one) => one.matchId)).toEqual([
      'final-5',
      'final-4',
      'final-3',
      'final-2',
    ]);
  });

  it('separates delayed matches from upcoming and builds the now strip without finals', () => {
    const match = (
      matchId: string,
      state: OverviewMatch['state'],
      startsAt: string,
      score?: number,
    ): OverviewMatch => ({
      matchId,
      stageNumber: 1,
      matchNumber: Number(matchId.replace(/\D/g, '') || 1),
      state,
      startsAt,
      home: { name: 'Home', ...(score === undefined ? {} : { score }) },
      away: { name: 'Away', ...(score === undefined ? {} : { score: 0 }) },
    });

    const now = new Date('2026-11-23T14:20:00Z');
    const summary = summarizeOverviewMatches(
      [
        match('m1', 'final', '2026-11-23T12:00:00Z', 2),
        match('m2', 'upcoming', '2026-11-23T14:00:00Z'), // +20 min -> delayed
        match('m3', 'upcoming', '2026-11-23T14:10:00Z'), // +10 min -> still upcoming
        match('m4', 'upcoming', '2026-11-23T16:00:00Z'), // future upcoming
      ],
      4,
      now,
    );

    expect(summary.delayed.map((one) => one.matchId)).toEqual(['m2']);
    expect(summary.upcoming.map((one) => one.matchId)).toEqual(['m3', 'm4']);

    // No live match -> delayed + first upcoming only (never m4 or final m1).
    expect(selectNowStripMatches(summary).map((one) => one.matchId)).toEqual(['m2', 'm3']);

    // When a live match exists, upcoming is omitted from the now strip.
    const withLive = summarizeOverviewMatches(
      [
        match('m1', 'final', '2026-11-23T12:00:00Z', 2),
        match('m2', 'upcoming', '2026-11-23T14:00:00Z'),
        match('m3', 'upcoming', '2026-11-23T14:10:00Z'),
        match('m5', 'live', '2026-11-23T14:05:00Z', 1),
      ],
      4,
      now,
    );
    expect(selectNowStripMatches(withLive).map((one) => one.matchId)).toEqual(['m5', 'm2']);

    // Only finished matches -> now strip is empty (never shows a final).
    const onlyFinal = summarizeOverviewMatches(
      [match('m1', 'final', '2026-11-23T12:00:00Z', 2)],
      4,
      now,
    );
    expect(selectNowStripMatches(onlyFinal)).toEqual([]);
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
  const row = (name: string, zoneName?: string, groupName?: string) => ({
    position: 1,
    name,
    played: 1,
    points: 3,
    ...(zoneName === undefined ? {} : { zoneName }),
    ...(groupName === undefined ? {} : { groupName }),
  });

  it('keeps rows that name no zone together as one unnamed block', () => {
    const blocks = groupStandingsByZone([row('A'), row('B')]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.zoneName).toBeUndefined();
    expect(blocks[0]?.groupName).toBeUndefined();
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

  it('splits rows into one block per group within a zone in segment order', () => {
    const blocks = groupStandingsByZone([
      row('Team A1', 'Grupos', 'Grupo A'),
      row('Team A2', 'Grupos', 'Grupo A'),
      row('Team B1', 'Grupos', 'Grupo B'),
      row('Team B2', 'Grupos', 'Grupo B'),
      row('Team C1', 'Zona Sur', 'Grupo A'),
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ zoneName: 'Grupos', groupName: 'Grupo A' });
    expect(blocks[0]?.rows.map((r) => r.name)).toEqual(['Team A1', 'Team A2']);
    expect(blocks[1]).toMatchObject({ zoneName: 'Grupos', groupName: 'Grupo B' });
    expect(blocks[1]?.rows.map((r) => r.name)).toEqual(['Team B1', 'Team B2']);
    expect(blocks[2]).toMatchObject({ zoneName: 'Zona Sur', groupName: 'Grupo A' });
    expect(blocks[2]?.rows.map((r) => r.name)).toEqual(['Team C1']);
  });

  it('returns nothing for no rows', () => {
    expect(groupStandingsByZone([])).toEqual([]);
  });
});
