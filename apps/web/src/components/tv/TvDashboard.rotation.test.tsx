import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { TvDashboard } from './TvDashboard.js';
import type { StandingsRowView } from '../../lib/overview.js';
import {
  dashboardLabels,
  knockoutZone,
  listEntry,
  renderDashboard,
  tvLabels,
} from './TvDashboard.test-support.js';

describe('TvDashboard zone presentation', () => {
  describe('rotation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const activeTab = (): string | undefined =>
      screen
        .getAllByRole('button')
        .find((button) => button.classList.contains('tv-rail-tab--active'))?.textContent ??
      undefined;
    const next = (): void => {
      act(() => jest.advanceTimersByTime(10_000));
    };

    it('visits the bracket and then the match list for a stage that has both', () => {
      renderDashboard({
        initialBracket: { stageNumber: 1, zones: [knockoutZone] },
        matchList: [listEntry],
      });

      const visited = [activeTab()];
      for (let step = 0; step < 5; step += 1) {
        next();
        visited.push(activeTab());
      }

      expect(visited).toEqual([
        dashboardLabels.standingsTab,
        dashboardLabels.performersTeamsTab,
        dashboardLabels.statisticsTab,
        dashboardLabels.bracketTab,
        dashboardLabels.fixturesTab,
        dashboardLabels.standingsTab,
      ]);
    });

    it('skips the match list when there are no matches', () => {
      renderDashboard({ initialBracket: { stageNumber: 1, zones: [knockoutZone] } });

      const visited = [activeTab()];
      for (let step = 0; step < 5; step += 1) {
        next();
        visited.push(activeTab());
      }

      expect(visited).not.toContain(dashboardLabels.fixturesTab);
    });
  });
});

describe('the rail under reduced motion', () => {
  const ROW = 50;
  const TOP = 100;
  const PAGER = 20;
  const frameHeight = TOP + 6 * ROW + PAGER + 24;

  /** Gives the rail's frame and its rows the geometry a browser would; jsdom computes none. */
  function railGeometry(): () => void {
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('data-testid') === 'tv-rail-content' ? frameHeight : 0;
      },
    });
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      const base = rect.call(this);
      const box = (top: number, height: number) =>
        ({ ...base, top, bottom: top + height, height }) as DOMRect;
      if (this.tagName === 'TR') {
        const rows = Array.from(this.closest('table')?.querySelectorAll('tr') ?? []) as Element[];
        return box(TOP + rows.indexOf(this as Element) * ROW, ROW);
      }
      if (this.tagName === 'P') return box(frameHeight - PAGER, PAGER);
      return base;
    };
    return () => {
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
      Element.prototype.getBoundingClientRect = rect;
    };
  }

  it('keeps turning the standings pages while the tab holds still', async () => {
    jest.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const restore = railGeometry();
    try {
      const rows: StandingsRowView[] = Array.from({ length: 24 }, (_, index) => ({
        position: index + 1,
        name: `Club ${index + 1}`,
        abbreviation: `C${index + 1}`,
        clubId: `c${index + 1}`,
        played: 3,
        points: 24 - index,
      }));
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          initial={{ matches: [], standingsVersion: 1, usingLastKnown: false }}
          labels={tvLabels}
          language="en"
          pollIntervalMs={0}
          standings={rows}
          streamPath="/events/tv/liga/tournaments/apertura"
        />,
      );
      // The frame measures on the next animation frame, which the fake clock advances past.
      act(() => jest.advanceTimersByTime(20));
      const firstPageTop = document.querySelector('.tv-standings-table tbody td')?.textContent;
      expect(screen.getByText(/Page 1 of/)).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));

      expect(screen.getByText(/Page 2 of/)).toBeDefined();
      expect(document.querySelector('.tv-standings-table tbody td')?.textContent).not.toBe(
        firstPageTop,
      );
      expect(
        screen
          .getByRole('button', { name: dashboardLabels.standingsTab })
          .classList.contains('tv-rail-tab--active'),
      ).toBe(true);
    } finally {
      restore();
      window.matchMedia = original;
      jest.useRealTimers();
    }
  });
});
