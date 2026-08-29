import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { PlatformAdministrationRoute } from './components/PlatformAdministrationRoute.js';
import { createControlApiClient } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const installedModule = {
  moduleId: '01800000-0000-7000-8000-000000000001',
  kind: 'discipline' as const,
  alias: 'football',
  version: '1.0.0',
  sourceKind: 'curated' as const,
  attributionAuthor: 'CopaLibre',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('platform administration console', () => {
  it('creates an organization and immediately invites its first administrator', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = createControlApiClient({
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url === '/installation/super-admins') return json([]);
        if (url === '/admin/modules') return json([]);
        if (url === '/disciplines') return json([]);
        if (url === '/organizations') {
          return json(
            {
              organizationId: '01800000-0000-7000-8000-000000000002',
              alias: 'liga-sur',
              name: 'Liga Sur',
              primaryLanguage: 'es',
              timezone: 'America/Argentina/San_Juan',
            },
            201,
          );
        }
        if (url === '/organizations/liga-sur/invitations') {
          return json({ invitationId: 'invite-1', expiresAt: '2099-01-01T00:00:00.000Z' }, 201);
        }
        return json({ message: 'not found' }, 404);
      },
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('No modules are installed.');

    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'liga-sur' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Liga Sur' } });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create organization' })),
    );
    expect(screen.getAllByText(/Organization liga-sur created. Invite/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('First administrator email'), {
      target: { value: 'admin@liga.test' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Invite administrator' })),
    );

    expect(calls.slice(3)).toEqual([
      {
        url: '/organizations',
        body: {
          alias: 'liga-sur',
          name: 'Liga Sur',
          primaryLanguage: 'es',
          timezone: 'America/Argentina/San_Juan',
        },
      },
      {
        url: '/organizations/liga-sur/invitations',
        body: { email: 'admin@liga.test', role: 'admin', status: 'active' },
      },
    ]);
    expect(
      screen.getByText('Organization liga-sur created and administrator invited.'),
    ).toBeDefined();
  });

  it('lists modules, sends a one-shot alternate source, verifies, and checks updates manually', async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = createControlApiClient({
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push({
          url,
          method,
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        if (url === '/admin/modules?outdated=true')
          return json([
            {
              alias: 'football',
              currentVersion: '1.0.0',
              latestVersion: '1.1.0',
              upgrade: 'minor',
            },
          ]);
        if (url === '/admin/modules/verify')
          return json([{ alias: 'football', version: '1.0.0', ok: true, failures: [] }]);
        if (url === '/admin/modules' && method === 'POST')
          return json(
            {
              kind: 'discipline',
              alias: 'football',
              version: '1.0.0',
              unsatisfiedRequiredCapabilities: [],
            },
            201,
          );
        if (url === '/admin/modules') return json([installedModule]);
        if (url === '/installation/super-admins') return json([]);
        return json({}, 200);
      },
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('CopaLibre');

    fireEvent.change(screen.getByLabelText('Module alias'), { target: { value: 'football' } });
    fireEvent.change(screen.getByLabelText('Alternate source (one use only)'), {
      target: { value: 'file:///modules/football' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install module' })));
    expect(screen.getByLabelText('Alternate source (one use only)')).toHaveProperty('value', '');
    expect(
      requests.find((request) => request.method === 'POST' && request.url === '/admin/modules')
        ?.body,
    ).toMatchObject({ source: 'file:///modules/football' });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verify' })));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Check for updates' })),
    );
    expect(await screen.findByText(/1.0.0 → 1.1.0/)).toBeDefined();
    expect(requests.some((request) => request.url === '/admin/modules/verify')).toBe(true);
  });

  it('shows API conflict text verbatim', async () => {
    const client = createControlApiClient({
      fetch: jest.fn(async (input) => {
        const url = String(input);
        if (url === '/admin/modules') return json([]);
        if (url === '/installation/super-admins') return json([]);
        return json({ message: 'Alias already belongs to another organization' }, 409);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('No modules are installed.');
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'liga-sur' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Liga Sur' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Alias already belongs to another organization',
      ),
    );
  });

  it('shows a module removal conflict verbatim', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/admin/modules' && (init?.method ?? 'GET') === 'GET') {
          return json([installedModule]);
        }
        if (url === '/installation/super-admins') return json([]);
        return json(
          { message: 'Cannot remove "football": referenced by started tournament(s): apertura' },
          409,
        );
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('CopaLibre');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Cannot remove "football": referenced by started tournament(s): apertura',
      ),
    );
    confirm.mockRestore();
  });

  it('grants and removes an installation super-admin, and reports the load failure', async () => {
    let superAdmins: { assignmentId: string; principalId: string; status: string }[] = [];
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/admin/modules') return json([]);
        if (url === '/installation/super-admins' && method === 'GET') return json(superAdmins);
        if (url === '/installation/super-admins' && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          const created = {
            assignmentId: '01800000-0000-7000-8000-000000000009',
            principalId: body.principalId,
            status: 'active',
          };
          superAdmins = [...superAdmins, created];
          return json(created, 201);
        }
        if (url.startsWith('/installation/super-admins/') && method === 'DELETE') {
          return json(
            { message: 'The installation must always keep at least one active super-admin' },
            409,
          );
        }
        return json({}, 200);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('No installation super-admins yet.');

    fireEvent.change(screen.getByLabelText('Principal ID'), {
      target: { value: '01800000-0000-7000-8000-000000000009' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Grant super-admin' })),
    );
    await screen.findByText('01800000-0000-7000-8000-000000000009', { exact: false });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove' })));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'The installation must always keep at least one active super-admin',
      ),
    );
  });

  it('reports a failure loading the installation super-admin list', async () => {
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/admin/modules') return json([]);
        if (url === '/installation/super-admins') return json({ message: 'Forbidden' }, 403);
        return json({}, 200);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Forbidden'));
  });

  it('drills into an organization alias to manage its users', async () => {
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/admin/modules') return json([]);
        if (url === '/installation/super-admins') return json([]);
        if (url === '/organizations/liga-sur/roles') {
          return json([
            {
              assignmentId: '01800000-0000-7000-8000-000000000010',
              principalId: '01800000-0000-7000-8000-000000000011',
              email: 'org-admin@example.test',
              role: 'admin',
              status: 'active',
            },
          ]);
        }
        return json({}, 200);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('No installation super-admins yet.');

    fireEvent.change(screen.getByLabelText('Organization alias'), {
      target: { value: 'liga-sur' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manage users' }));
    await screen.findByText('org-admin@example.test');
  });

  it('declines module removal when the confirm dialog is dismissed', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const removeRequests: string[] = [];
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/admin/modules' && method === 'GET') return json([installedModule]);
        if (url === '/installation/super-admins') return json([]);
        if (url === '/admin/modules/football' && method === 'DELETE') {
          removeRequests.push(url);
          return json({ alias: 'football', removedCount: 1 });
        }
        return json({}, 200);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('CopaLibre');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeRequests).toEqual([]);
    confirm.mockRestore();
  });

  it('shows a module verification failure and an install failure verbatim', async () => {
    const client = createControlApiClient({
      fetch: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/admin/modules' && method === 'GET') return json([installedModule]);
        if (url === '/installation/super-admins') return json([]);
        if (url === '/admin/modules/verify')
          return json([
            {
              alias: 'football',
              version: '1.0.0',
              ok: false,
              failures: [{ message: 'Missing required capability: statistics' }],
            },
          ]);
        if (url === '/admin/modules' && method === 'POST') {
          return json({ message: 'Module already installed' }, 409);
        }
        return json({}, 200);
      }),
    });
    render(withIntl(<PlatformAdministrationRoute client={client} />));
    await screen.findByText('CopaLibre');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verify' })));
    await screen.findByText('Missing required capability: statistics');

    fireEvent.change(screen.getByLabelText('Module alias'), { target: { value: 'football' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install module' })));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) => alert.textContent?.includes('Module already installed')),
      ).toBe(true),
    );
  });
});
