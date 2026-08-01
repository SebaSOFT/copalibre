import { buildOverview, displayName, shortLabel, STATE_LABEL } from './overview.js';
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

  it('gives every state a label', () => {
    for (const state of ['live', 'upcoming', 'final', 'disputed'] as const) {
      expect(STATE_LABEL[state].length).toBeGreaterThan(0);
    }
  });

  it('shows the abbreviation when there is one and the name when there is not', () => {
    // Never a truncation invented here (0037).
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
