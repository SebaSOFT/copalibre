import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '../../i18n/test-support.js';
import type { MatchConsoleResponse } from '../../lib/api-client.js';
import { ORG, TOURNAMENT, consoleProjection, ids, storyClient } from '../screen-story-fixtures.js';
import { MatchConsoleTemplate } from './MatchConsoleTemplate.js';

type Projection = MatchConsoleResponse;

const regulation = { type: 'half', typeLabel: 'Half', count: 2, maximum: 2 };

function renderConsole(projection: Projection, onAddSegment = jest.fn<(type: string) => void>()) {
  render(
    withIntl(
      <MatchConsoleTemplate
        api={storyClient({})}
        finalizing={false}
        lastSyncedAt={undefined}
        matchId={ids.match}
        onAddSegment={onAddSegment}
        onCorrectClock={() => undefined}
        onCancelFinalize={() => undefined}
        onDismissMutation={() => undefined}
        onFinalize={async () => true}
        onIssueClockCommand={() => undefined}
        onReopenSegment={() => undefined}
        onRecordEvent={() => undefined}
        onResolveTimer={() => undefined}
        onRosterSaved={() => undefined}
        online
        organizationAlias={ORG}
        pendingMutations={[]}
        projection={projection}
        stale={false}
        status={{ kind: 'ready' }}
        tournamentAlias={TOURNAMENT}
        tournamentName="Apertura 2026"
      />,
    ),
  );
  return onAddSegment;
}

function clockCard(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Clock and period' });
  const card = heading.closest('.cl-card');
  if (!(card instanceof HTMLElement)) throw new Error('clock card not found');
  return card;
}

describe('MatchConsoleTemplate clock card', () => {
  it('a forfeited match offers no clock action and no time correction', () => {
    renderConsole({
      ...consoleProjection,
      status: 'forfeited',
      events: [],
    });

    expect(screen.queryByLabelText('Time (mm:ss)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull();
    expect(clockCard().querySelector('.cl-clock-commands')).toBeNull();
  });

  it('a scheduled match with no segments says what Start creates and offers Start match', () => {
    renderConsole({
      ...consoleProjection,
      status: 'scheduled',
      segments: [],
      events: [],
      segmentPlan: { regulation, addable: [{ type: 'half', typeLabel: 'Half', withinPlan: true }] },
    });

    expect(clockCard().textContent).toContain('Start creates 2 Half segments');
    expect(clockCard().querySelector('button')?.textContent).toBe('Start match');
    expect(screen.queryByRole('button', { name: 'Add segment' })).toBeNull();
  });

  it('a scheduled match whose discipline has no segment type offers no Start', () => {
    renderConsole({
      ...consoleProjection,
      status: 'scheduled',
      segments: [],
      events: [],
      segmentPlan: { addable: [] },
    });

    expect(clockCard().textContent).toContain('This match has no segments yet.');
    expect(clockCard().querySelector('button')).toBeNull();
  });

  it('an in-progress match offers Add segment, and submits the type it shows', () => {
    const onAddSegment = renderConsole({
      ...consoleProjection,
      status: 'in-progress',
      segmentPlan: {
        regulation,
        addable: [
          { type: 'half', typeLabel: 'Half', withinPlan: true },
          { type: 'extra-time', typeLabel: 'Extra time', withinPlan: true },
        ],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add segment' }));

    expect(onAddSegment).toHaveBeenCalledWith('half');
  });

  it('labels an addition outside the plan in the choice the operator sees', () => {
    renderConsole({
      ...consoleProjection,
      status: 'in-progress',
      segmentPlan: {
        regulation: { type: 'set', typeLabel: 'Set', count: 2, maximum: 3 },
        addable: [{ type: 'set', typeLabel: 'Set', withinPlan: false }],
      },
    });

    expect(clockCard().textContent).toContain('Set (outside the plan)');
  });

  it('an in-progress match with no segments offers Add segment beside Finalize, with no clock command', () => {
    renderConsole({
      ...consoleProjection,
      status: 'in-progress',
      segments: [],
      events: [],
      segmentPlan: {
        regulation,
        addable: [{ type: 'half', typeLabel: 'Half', withinPlan: true }],
      },
    });

    expect(clockCard().textContent).toContain('This match has no segments yet.');
    expect(screen.getByRole('button', { name: 'Add segment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start match' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Finalize match' })).toBeTruthy();
  });
});
