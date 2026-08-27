import { render, screen, waitFor } from '@testing-library/react';
import { ScheduleBuilderRoute } from './ScheduleBuilderRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    getStageFixtures: () =>
      Promise.resolve({
        stageId: 'stage-1',
        fixtures: [
          {
            fixtureId: 'fixture-1',
            matchId: 'match-1',
            round: 1,
            homeEntrantId: 'Godoy Cruz',
            awayEntrantId: 'Independiente Rivadavia',
          },
        ],
      }),
    getSchedule: () =>
      Promise.resolve({
        assignments: [],
      }),
    listVenues: () => Promise.resolve([]),
    listOfficials: () => Promise.resolve([]),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ScheduleBuilderRoute', () => {
  it('renders within ListScreenTemplate structure and displays fixtures and calendar view', async () => {
    const { container } = render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getAllByText(/Godoy Cruz/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Independiente Rivadavia/i).length).toBeGreaterThan(0);
  });
});
