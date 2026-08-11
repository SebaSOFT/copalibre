import { jest } from '@jest/globals';
import { tournamentTools } from './tournament-tools.js';

function fakeConfig(fetchImplementation: typeof fetch) {
  return { baseUrl: 'http://api.invalid', token: 'test-token', fetchImplementation };
}

function toolNamed(fetchImplementation: typeof fetch, name: string) {
  const tool = tournamentTools(fakeConfig(fetchImplementation)).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`No tool named "${name}"`);
  return tool;
}

describe('tournamentTools (0047)', () => {
  it('registers exactly the five curated tournament-operational tools', () => {
    const tools = tournamentTools(fakeConfig(jest.fn<typeof fetch>()));
    expect(tools.map((tool) => tool.name)).toEqual([
      'copalibre_get_organization',
      'copalibre_list_tournaments',
      'copalibre_get_tournament',
      'copalibre_create_tournament',
      'copalibre_publish_tournament',
    ]);
  });

  it('copalibre_get_organization GETs /organizations/:alias', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ alias: 'liga' }), { status: 200 }),
    );
    const tool = toolNamed(fetchImplementation, 'copalibre_get_organization');

    await tool.handler({ alias: 'liga' });

    const [url, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/organizations/liga');
    expect(init.method).toBe('GET');
  });

  it('copalibre_list_tournaments GETs the organization-scoped tournaments route', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    );
    const tool = toolNamed(fetchImplementation, 'copalibre_list_tournaments');

    await tool.handler({ organization_alias: 'liga' });

    const [url] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/organizations/liga/tournaments');
  });

  it('copalibre_get_tournament GETs the scoped-alias route', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ alias: 'copa' }), { status: 200 }),
    );
    const tool = toolNamed(fetchImplementation, 'copalibre_get_tournament');

    await tool.handler({ organization_alias: 'liga', tournament_alias: 'copa' });

    const [url] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/organizations/liga/tournaments/copa');
  });

  it('copalibre_create_tournament POSTs the camelCase request body', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ alias: 'copa' }), { status: 201 }),
    );
    const tool = toolNamed(fetchImplementation, 'copalibre_create_tournament');

    await tool.handler({
      organization_alias: 'liga',
      alias: 'copa',
      name: 'Copa Verano',
      descriptor_id: 'discipline-id',
      descriptor_version: '1.2.0',
      format: 'round-robin',
      public_registration: true,
      requires_check_in: false,
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/organizations/liga/tournaments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      alias: 'copa',
      name: 'Copa Verano',
      descriptorId: 'discipline-id',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: false,
    });
  });

  it('copalibre_publish_tournament POSTs the publish route with no body', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ status: 'published' }), { status: 200 }),
    );
    const tool = toolNamed(fetchImplementation, 'copalibre_publish_tournament');

    await tool.handler({ organization_alias: 'liga', tournament_alias: 'copa' });

    const [url, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/organizations/liga/tournaments/copa/publish');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('rejects a missing required argument before making any request', async () => {
    const fetchImplementation = jest.fn<typeof fetch>();
    const tool = toolNamed(fetchImplementation, 'copalibre_get_tournament');

    await expect(tool.handler({ organization_alias: 'liga' })).rejects.toThrow(
      'tournament_alias must be a non-empty string',
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('describes what each tool does, when to use it, and that it requires a token (0048)', () => {
    for (const tool of tournamentTools(fakeConfig(jest.fn<typeof fetch>()))) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description).toContain('COPALIBRE_MCP_TOKEN');
    }
  });
});
