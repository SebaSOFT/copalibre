import { SIDENAV, buildDashboard, countKickoffsOnDay, visibleSidenav } from './dashboard.js';

describe('visibleSidenav', () => {
  it('shows every entry when the role has not resolved yet', () => {
    expect(visibleSidenav(undefined)).toEqual(SIDENAV);
  });

  it('shows every entry to admin, including user administration', () => {
    expect(visibleSidenav('admin').map((item) => item.id)).toEqual(SIDENAV.map((item) => item.id));
  });

  it('hides the user-administration entry from club-admin, following from the mapping', () => {
    expect(visibleSidenav('club-admin').map((item) => item.id)).not.toContain('roles');
  });

  it('hides the user-administration entry from referee', () => {
    expect(visibleSidenav('referee').map((item) => item.id)).not.toContain('roles');
  });

  it('hides the user-administration entry from broadcaster and viewer', () => {
    expect(visibleSidenav('broadcaster').map((item) => item.id)).not.toContain('roles');
    expect(visibleSidenav('viewer').map((item) => item.id)).not.toContain('roles');
  });

  it('hides the audit-trail entry from every role but admin', () => {
    for (const role of [
      'club-admin',
      'tournament-admin',
      'referee',
      'broadcaster',
      'viewer',
    ] as const) {
      expect(visibleSidenav(role).map((item) => item.id)).not.toContain('audit-trail');
    }
    expect(visibleSidenav('admin').map((item) => item.id)).toContain('audit-trail');
  });

  it('keeps every ungated entry for every role', () => {
    for (const role of [
      'club-admin',
      'referee',
      'broadcaster',
      'viewer',
      'tournament-admin',
    ] as const) {
      const visibleIds = visibleSidenav(role).map((item) => item.id);
      for (const item of SIDENAV) {
        if (item.capability === undefined) expect(visibleIds).toContain(item.id);
      }
    }
  });
});

describe('countKickoffsOnDay', () => {
  // 2026-11-16 23:30 in Buenos Aires (UTC-3) is 02:30 on the 17th in UTC.
  const lateEvening = Date.parse('2026-11-17T02:30:00.000Z');
  const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';
  const at = (iso: string): number => Date.parse(iso);

  it("counts a kick-off on the organization's calendar day, not the UTC one", () => {
    expect(
      countKickoffsOnDay(
        [
          at('2026-11-16T22:00:00.000Z'), // 19:00 on the 16th, Buenos Aires
          at('2026-11-17T02:30:00.000Z'), // 23:30 on the 16th, Buenos Aires
          at('2026-11-17T03:00:00.000Z'), // 00:00 on the 17th, Buenos Aires
        ],
        lateEvening,
        BUENOS_AIRES,
      ),
    ).toBe(2);
  });

  it('reads the same instants as the next day in a zone ahead of it', () => {
    expect(
      countKickoffsOnDay([at('2026-11-17T02:30:00.000Z')], lateEvening, 'Pacific/Auckland'),
    ).toBe(1);
    expect(
      countKickoffsOnDay([at('2026-11-16T22:00:00.000Z')], lateEvening, 'Pacific/Auckland'),
    ).toBe(1);
  });

  it('counts nothing when no kick-off falls today', () => {
    expect(countKickoffsOnDay([at('2026-11-15T15:00:00.000Z')], lateEvening, BUENOS_AIRES)).toBe(0);
    expect(countKickoffsOnDay([], lateEvening, BUENOS_AIRES)).toBe(0);
  });

  it('does not count a kick-off that is not a time', () => {
    expect(countKickoffsOnDay([Number.NaN], lateEvening, BUENOS_AIRES)).toBe(0);
  });

  it('falls back to the browser zone when the organization has none or an unknown one', () => {
    const local = new Date(lateEvening);
    const kickoff = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 12).getTime();
    expect(countKickoffsOnDay([kickoff], lateEvening)).toBe(1);
    expect(countKickoffsOnDay([kickoff], lateEvening, 'Not/AZone')).toBe(1);
  });
});

describe('buildDashboard matches today', () => {
  const card = (alias: string, matchesToday?: number) => ({
    tournamentId: alias,
    organizationId: 'org-1',
    alias,
    name: alias,
    lifecycle: 'in-progress' as const,
    pendingRegistrations: 0,
    ...(matchesToday === undefined ? {} : { matchesToday }),
  });

  it('totals the count of every tournament', () => {
    const model = buildDashboard({
      organizationId: 'org-1',
      tournaments: [card('a', 3), card('b', 0), card('c', 2)],
      activity: [],
    });
    expect(model.stats.matchesToday).toBe(5);
  });

  it('withholds the total when one tournament has no count, rather than summing the rest', () => {
    const model = buildDashboard({
      organizationId: 'org-1',
      tournaments: [card('a', 3), card('b')],
      activity: [],
    });
    expect(model.stats.matchesToday).toBeUndefined();
  });
});
