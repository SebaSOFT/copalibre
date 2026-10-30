import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '../../i18n/test-support.js';
import { buildDashboard } from '../../lib/dashboard.js';
import { DashboardTemplate } from './DashboardTemplate.js';
import { ORG, ids } from '../screen-story-fixtures.js';

const baseProps = {
  canCreateTournament: true,
  canManageDisplayTokens: true,
  canManageTournamentLifecycle: true,
  devices: [],
  failed: false,
  loading: false,
  now: Date.now(),
  onArchive: () => undefined,
  onExport: () => undefined,
  onExportConfiguration: () => undefined,
  onPublish: () => undefined,
  onRetry: () => undefined,
  organizationAlias: ORG,
  staleSince: undefined,
} as const;

function modelWith(tournaments: Parameters<typeof buildDashboard>[0]['tournaments']) {
  return buildDashboard({ organizationId: ids.organization, tournaments, activity: [] });
}

describe('DashboardTemplate TV pairing', () => {
  it('explains the prerequisite without repeating the create action', () => {
    render(withIntl(<DashboardTemplate {...baseProps} model={modelWith([])} />));

    expect(screen.getByText('Create a tournament before pairing a TV screen.')).toBeDefined();
    expect(screen.getAllByRole('link', { name: 'Create your first tournament' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Pair TV' })).toBeNull();
    expect(screen.queryByText('An organization admin can pair a TV screen.')).toBeNull();
  });

  it('pairs with the selected tournament when an organization has several', () => {
    render(
      withIntl(
        <DashboardTemplate
          {...baseProps}
          model={modelWith([
            {
              tournamentId: ids.tournament,
              organizationId: ids.organization,
              alias: 'copa-premier',
              name: 'Copa Premier',
              lifecycle: 'in-progress',
              pendingRegistrations: 12,
            },
            {
              tournamentId: ids.second,
              organizationId: ids.organization,
              alias: 'copa-premier-femenina',
              name: 'Copa Premier femenina',
              lifecycle: 'upcoming',
              pendingRegistrations: 0,
            },
          ])}
        />,
      ),
    );

    const select = screen.getByLabelText('Tournament for TV pairing');
    fireEvent.change(select, { target: { value: ids.second } });

    expect(screen.getByRole('link', { name: 'Pair TV' }).getAttribute('href')).toBe(
      '/control/liga-san-juan/tournaments/copa-premier-femenina/broadcaster',
    );
  });
});
