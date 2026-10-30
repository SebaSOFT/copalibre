import { render, screen } from '@testing-library/react';
import type { ControlApiClient } from '../lib/api-client.js';
import { ControlShell } from './ControlShell.js';

describe('the Control-web data-density scope', () => {
  it('mounts data-density="control" at the shell root, scoping the denser spacing composition', () => {
    const { container } = render(
      <ControlShell active="tournaments" helpPath="tournaments">
        <p>Contenido</p>
      </ControlShell>,
    );
    expect(container.querySelector('[data-density="control"]')).not.toBeNull();
  });
});

describe('the control context rail', () => {
  const organizationAlias = 'liga-san-juan';
  const tournamentAlias = 'copa-premier';

  function client(role: 'admin' | 'viewer' | 'tournament-admin', status?: 'draft' | 'started') {
    return {
      listMyOrganizations: async () => [
        {
          organizationId: 'organization-id',
          organizationAlias,
          organizationName: 'Liga San Juan',
          timezone: 'America/Argentina/Buenos_Aires',
          role,
        },
      ],
      ...(status === undefined
        ? {}
        : {
            listActiveTournaments: async () => [
              {
                tournamentId: 'tournament-id',
                alias: tournamentAlias,
                name: 'Copa Premier',
                status,
              },
            ],
          }),
    } as unknown as ControlApiClient;
  }

  it('renders organization scope and pins tournament creation for an authorized role', async () => {
    window.history.replaceState({}, '', `/control/${organizationAlias}`);
    const { container } = render(
      <ControlShell
        active="dashboard"
        client={client('admin')}
        helpPath="overview"
        organizationAlias={organizationAlias}
      >
        <p>Contenido</p>
      </ControlShell>,
    );

    await screen.findByText('Liga San Juan');
    expect(container.querySelector('[data-scope="organization"]')).not.toBeNull();
    expect(
      container.querySelector(`a[href="/control/${organizationAlias}/tournaments/new"]`),
    ).not.toBeNull();
  });

  it('hides organization actions when the role cannot create tournaments', async () => {
    window.history.replaceState({}, '', `/control/${organizationAlias}`);
    const { container } = render(
      <ControlShell
        active="dashboard"
        client={client('viewer')}
        helpPath="overview"
        organizationAlias={organizationAlias}
      >
        <p>Contenido</p>
      </ControlShell>,
    );

    await screen.findByText('Liga San Juan');
    expect(
      container.querySelector(`a[href="/control/${organizationAlias}/tournaments/new"]`),
    ).toBeNull();
  });

  it('renders tournament scope and offers live operations only to a role with that capability', async () => {
    window.history.replaceState(
      {},
      '',
      `/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`,
    );
    const { container } = render(
      <ControlShell
        active="tournaments"
        client={client('tournament-admin', 'started')}
        helpPath="tournament-authoring"
        organizationAlias={organizationAlias}
      >
        <p>Contenido</p>
      </ControlShell>,
    );

    await screen.findByText('Copa Premier');
    expect(container.querySelector('[data-scope="tournament"]')).not.toBeNull();
    expect(container.querySelector(`a[href="/control/${organizationAlias}/live"]`)).not.toBeNull();
  });

  it('shows the supplied draft status without pinning a lifecycle action for a tournament operator', async () => {
    window.history.replaceState(
      {},
      '',
      `/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`,
    );
    const { container } = render(
      <ControlShell
        active="tournaments"
        client={client('tournament-admin', 'draft')}
        helpPath="tournament-authoring"
        organizationAlias={organizationAlias}
      >
        <p>Contenido</p>
      </ControlShell>,
    );

    await screen.findByText('Copa Premier');
    expect(container.querySelector('[data-scope="tournament"] .cl-badge')).not.toBeNull();
    expect(
      container.querySelector('[data-scope="tournament"] .cl-context-rail-header__action'),
    ).toBeNull();
  });
});
