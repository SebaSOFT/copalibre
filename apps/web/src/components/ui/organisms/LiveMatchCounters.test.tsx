import { jest } from '@jest/globals';
import { act, render } from '@testing-library/react';
import type { EventEnvelope } from '@copalibre/realtime';
import { LiveMatchCounters } from './LiveMatchCounters.js';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
} from '../../../lib/live-scoreboard-store.js';
import type { LiveMatchCounter } from '../../../lib/live-state.js';

const MATCH_ID = 'm-1';
const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} of {allowance}',
  warning: 'warning',
};
const COUNTERS: readonly LiveMatchCounter[] = [
  {
    code: 'team-fouls',
    label: { en: 'Team fouls' },
    shortLabel: 'F',
    scope: 'match',
    events: ['team-foul'],
    values: [{ entrantId: 'home', value: 2 }],
  },
  {
    code: 'timeouts',
    label: { en: 'Timeouts' },
    shortLabel: 'TM',
    scope: 'segment',
    events: ['timeout'],
    allowance: 1,
    values: [{ entrantId: 'home', value: 1 }],
  },
];
const PENALTIES = [{ timerId: 't1', entrantId: 'away', remainingSeconds: 120 }];
const SIDES = [
  { entrantId: 'home', name: 'Club Andes' },
  { entrantId: 'away', name: 'Deportivo Sur' },
];

function finalized(projectionVersion: number): EventEnvelope {
  return {
    eventType: 'match.finalized',
    payload: { matchId: MATCH_ID, result: {} },
    projectionVersion,
    createdAt: '2026-11-18T10:00:00.000Z',
  } as unknown as EventEnvelope;
}

function renderIsland(live: boolean) {
  return render(
    <LiveMatchCounters
      initialCounters={COUNTERS}
      initialPenalties={PENALTIES}
      language="en"
      live={live}
      matchId={MATCH_ID}
      organizationAlias="liga"
      penaltyTemplate="{side}: {time} suspension"
      sides={SIDES}
      texts={TEXTS}
      tournamentAlias="apertura"
    />,
  );
}

describe('LiveMatchCounters', () => {
  beforeEach(() => {
    resetLiveScoreboardStore();
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false }));
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('shows the segment counters and the penalty while the store says the match is live', () => {
    seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' });
    const { container } = renderIsland(true);
    expect(container.textContent).toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).not.toBeNull();
  });

  it('keeps only the match-scope counters and drops the penalty when the store says the match is final', () => {
    // The store, not the server's `live` prop, decides: the page was rendered while live.
    seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'final' });
    const { container } = renderIsland(true);
    expect(container.textContent).toContain('Team fouls');
    expect(container.textContent).not.toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });

  it('reacts to a match.finalized event received while the page is open', () => {
    seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' });
    const { container } = renderIsland(true);
    expect(container.textContent).toContain('Timeouts');

    act(() => {
      publishLiveScoreboardEvent(finalized(2));
    });
    expect(container.textContent).toContain('Team fouls');
    expect(container.textContent).not.toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });

  it('falls back to the server view for a match the store has not seen', () => {
    const { container } = renderIsland(false);
    expect(container.textContent).toContain('Team fouls');
    expect(container.textContent).not.toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });
});
