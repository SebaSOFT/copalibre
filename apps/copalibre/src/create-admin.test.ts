import { jest } from '@jest/globals';
import { createInitialAdministrator, parseCreateAdminArguments } from './create-admin.js';

const environment: NodeJS.ProcessEnv = {
  COPALIBRE_API_URL: 'http://localhost:3001',
  COPALIBRE_BOOTSTRAP_TOKEN: 'operator-bootstrap-secret',
};

describe('create-admin', () => {
  it('parses the organization and verified administrator email', () => {
    expect(
      parseCreateAdminArguments([
        '--organization-alias',
        'liga-san-juan',
        '--organization-name',
        'Liga San Juan',
        '--email',
        'admin@liga.example',
      ]),
    ).toEqual({
      organizationAlias: 'liga-san-juan',
      organizationName: 'Liga San Juan',
      email: 'admin@liga.example',
    });
  });

  it('requires every bootstrap field', () => {
    expect(() => parseCreateAdminArguments([])).toThrow('--organization-alias is required');
    expect(() =>
      parseCreateAdminArguments(['--organization-alias', 'liga', '--organization-name', 'Liga']),
    ).toThrow('--email is required');
  });

  it('sends the capability token only in the bootstrap request and returns its setup link', async () => {
    const requestFetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ setupUrl: 'https://copalibre.example/invitations/accept?token=one' }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ) as unknown as typeof fetch;

    await expect(
      createInitialAdministrator(
        { organizationAlias: 'liga', organizationName: 'Liga', email: 'admin@liga.example' },
        environment,
        requestFetch,
      ),
    ).resolves.toEqual({ setupUrl: 'https://copalibre.example/invitations/accept?token=one' });

    expect(requestFetch).toHaveBeenCalledWith(
      new URL('http://localhost:3001/installation/bootstrap/admin'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-copalibre-bootstrap-token': 'operator-bootstrap-secret',
        }),
      }),
    );
  });

  it('reports a failed bootstrap without echoing the operator token', async () => {
    await expect(
      createInitialAdministrator(
        { organizationAlias: 'liga', organizationName: 'Liga', email: 'admin@liga.example' },
        environment,
        async () =>
          new Response(JSON.stringify({ message: 'already initialized' }), { status: 409 }),
      ),
    ).rejects.toThrow('installation bootstrap returned HTTP 409: already initialized');
  });

  it('rejects incomplete configuration and malformed successful responses', async () => {
    await expect(
      createInitialAdministrator(
        { organizationAlias: 'liga', organizationName: 'Liga', email: 'admin@liga.example' },
        {},
      ),
    ).rejects.toThrow('COPALIBRE_API_URL is required');
    await expect(
      createInitialAdministrator(
        { organizationAlias: 'liga', organizationName: 'Liga', email: 'admin@liga.example' },
        { COPALIBRE_API_URL: 'http://localhost:3001' },
      ),
    ).rejects.toThrow('COPALIBRE_BOOTSTRAP_TOKEN is required');
    await expect(
      createInitialAdministrator(
        { organizationAlias: 'liga', organizationName: 'Liga', email: 'admin@liga.example' },
        environment,
        async () => new Response('{}', { status: 201 }),
      ),
    ).rejects.toThrow('installation bootstrap did not return a setup URL');
  });
});
