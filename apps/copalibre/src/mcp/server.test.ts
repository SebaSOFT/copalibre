import { buildServer, buildTools } from './server.js';

describe('buildTools (0047)', () => {
  it('registers only the three admin tools when no token/API URL is configured', () => {
    const names = buildTools({}).map((tool) => tool.name);
    expect(names).toEqual(['copalibre_doctor', 'copalibre_module_list', 'copalibre_upgrade_check']);
  });

  it('registers all eight tools when both COPALIBRE_MCP_TOKEN and COPALIBRE_API_URL are set', () => {
    const names = buildTools({
      COPALIBRE_MCP_TOKEN: 'token',
      COPALIBRE_API_URL: 'http://localhost:3001',
    }).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_get_organization',
      'copalibre_list_tournaments',
      'copalibre_get_tournament',
      'copalibre_create_tournament',
      'copalibre_publish_tournament',
    ]);
  });

  it('registers only admin tools when a token is set without an API URL, or vice versa', () => {
    expect(buildTools({ COPALIBRE_MCP_TOKEN: 'token' })).toHaveLength(3);
    expect(buildTools({ COPALIBRE_API_URL: 'http://localhost:3001' })).toHaveLength(3);
  });
});

describe('buildServer (0047)', () => {
  it('constructs without throwing given a tool list', () => {
    expect(() => buildServer({}, buildTools({}))).not.toThrow();
  });
});
