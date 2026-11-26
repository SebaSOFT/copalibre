import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { RailTab } from './tv-dashboard-model.js';

/**
 * The rail's automatic carousel: each tick turns the next page of the list or the standings, then moves to
 * the next tab. A fixed view holds its own tab. Under reduced motion the tabs hold still while the pages
 * keep turning.
 */
export function useTvRotation({
  tabsMove,
  initialView,
  matchPagesCount,
  railPageCount,
  railTabs,
  setRail,
}: {
  readonly tabsMove: boolean;
  readonly initialView: 'standings' | 'matches' | undefined;
  readonly matchPagesCount: number;
  readonly railPageCount: number;
  readonly railTabs: readonly RailTab[];
  readonly setRail: Dispatch<SetStateAction<{ readonly tab: RailTab; readonly page: number }>>;
}): void {
  useEffect(() => {
    const interval = setInterval(() => {
      setRail((current) => {
        if (current.tab === 'fixtures' && current.page < matchPagesCount - 1) {
          return { tab: 'fixtures', page: current.page + 1 };
        }
        if (current.tab === 'standings' && current.page < railPageCount - 1) {
          return { tab: 'standings', page: current.page + 1 };
        }
        if (!tabsMove) return current;
        if (initialView === 'matches') return { tab: 'fixtures', page: 0 };
        if (initialView === 'standings') return { tab: 'standings', page: 0 };
        const index = railTabs.indexOf(current.tab);
        const next = railTabs[(index + 1) % railTabs.length] ?? 'standings';
        return { tab: next, page: 0 };
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [tabsMove, initialView, matchPagesCount, railTabs, railPageCount, setRail]);
}
