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
const SIDES = [
  { entrantId: 'home', name: 'Club Andes', place: 'home' as const },
  { entrantId: 'away', name: 'Deportivo Sur', place: 'away' as const },
];
const PENALTIES = [{ timerId: 't1', entrantId: 'away', remainingSeconds: 120 }];

function counters(fouls: number, timeouts = 1): LiveMatchCounter[] {
  return [
    {
      code: 'team-fouls',
      label: { en: 'Team fouls' },
      shortLabel: 'F',
      scope: 'match',
      events: ['team-foul'],
      values: [{ entrantId: 'home', value: fouls }],
    },
    {
      code: 'timeouts',
      label: { en: 'Timeouts' },
      shortLabel: 'TM',
      scope: 'segment',
      events: ['timeout'],
      allowance: 1,
      values: [{ entrantId: 'home', value: timeouts }],
    },
  ];
}

function envelope(
  eventType: string,
  projectionVersion: number,
  payload: object = {},
): EventEnvelope {
  return {
    eventType,
    payload: { matchId: MATCH_ID, ...payload },
    projectionVersion,
    createdAt: '2026-11-18T10:00:00.000Z',
  } as unknown as EventEnvelope;
}

function renderIsland(props: { live: boolean; finished?: boolean; fetchFouls?: () => number }) {
  return render(
    <LiveMatchCounters
      finished={props.finished ?? false}
      initialCounters={counters(1)}
      initialPenalties={PENALTIES}
      language="en"
      live={props.live}
      matchId={MATCH_ID}
      matchOrdinal={5}
      organizationAlias="liga"
      penaltyTemplate="{side}: {time} suspension"
      sides={SIDES}
      stageNumber={1}
      texts={TEXTS}
      tournamentAlias="apertura"
    />,
  );
}

/** The visible value of the home side's team-fouls counter. */
function homeValue(container: HTMLElement): string | null | undefined {
  return container.querySelector('.cl-match-counter--home [aria-hidden="true"]')?.textContent;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

describe('LiveMatchCounters', () => {
  let serverFouls: number;
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    resetLiveScoreboardStore();
    serverFouls = 1;
    fetchMock = jest.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/stages/'))
        return { ok: true, json: async () => ({ counters: counters(serverFouls, 0).slice(0, 1) }) };
      return {
        ok: true,
        json: async () => ({
          matches: [
            { matchId: MATCH_ID, counters: counters(serverFouls), activePenalties: PENALTIES },
          ],
        }),
      };
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.useRealTimers();
  });

  it('shows the segment counters and the penalty while the store says the match is live', () => {
    act(() => seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' }));
    const { container } = renderIsland({ live: true });
    expect(container.textContent).toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).not.toBeNull();
  });

  it('keeps only the match-scope counters and drops the penalty when the store says the match is final', () => {
    act(() => seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'final' }));
    const { container } = renderIsland({ live: true });
    expect(container.textContent).toContain('Team fouls');
    expect(container.textContent).not.toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });

  it('ends on a match.finalized event: the segment counters and penalty leave', async () => {
    jest.useFakeTimers();
    act(() => seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' }));
    const { container } = renderIsland({ live: true });
    expect(container.textContent).toContain('Timeouts');
    await act(async () => {
      publishLiveScoreboardEvent(envelope('match.finalized', 2, { result: {} }));
    });
    expect(container.textContent).not.toContain('Timeouts');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });

  it('ends with the final count of the server, after a foul, a foul 300 ms later and the finalize 500 ms later', async () => {
    jest.useFakeTimers();
    act(() => seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' }));
    const { container } = renderIsland({ live: true });
    await settle();

    serverFouls = 1;
    await act(async () => {
      publishLiveScoreboardEvent(
        envelope('match.event-recorded', 2, { definitionCode: 'team-foul' }),
      );
    });
    await settle();
    expect(homeValue(container)).toBe('1');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    serverFouls = 2;
    await act(async () => {
      publishLiveScoreboardEvent(
        envelope('match.event-recorded', 3, { definitionCode: 'team-foul' }),
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {
      publishLiveScoreboardEvent(envelope('match.finalized', 4, { result: {} }));
    });
    await settle();

    expect(homeValue(container)).toBe('2');
  });

  it('a page rendered after the match ended takes no part in the stream', async () => {
    renderIsland({ live: false, finished: true });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the server view for a match the store has not seen', () => {
    const { container } = renderIsland({ live: false });
    expect(container.textContent).toContain('Team fouls');
    expect(container.querySelector('.cl-match-penalty')).toBeNull();
  });
});
