import { SERVER_INSTRUCTIONS, buildServer, buildTools } from './server.js';

describe('buildTools (0047)', () => {
  it('registers the six always-on tools when no token/API URL is configured', () => {
    const names = buildTools({}).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_module_scaffold',
      'copalibre_module_validate_local',
      'copalibre_module_submit',
    ]);
  });

  it('registers all eleven tools when both COPALIBRE_MCP_TOKEN and COPALIBRE_API_URL are set', () => {
    const names = buildTools({
      COPALIBRE_MCP_TOKEN: 'token',
      COPALIBRE_API_URL: 'http://localhost:3001',
    }).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_module_scaffold',
      'copalibre_module_validate_local',
      'copalibre_module_submit',
      'copalibre_get_organization',
      'copalibre_list_tournaments',
      'copalibre_get_tournament',
      'copalibre_create_tournament',
      'copalibre_publish_tournament',
    ]);
  });

  it('registers only the six always-on tools when a token is set without an API URL, or vice versa', () => {
    expect(buildTools({ COPALIBRE_MCP_TOKEN: 'token' })).toHaveLength(6);
    expect(buildTools({ COPALIBRE_API_URL: 'http://localhost:3001' })).toHaveLength(6);
  });
});

describe('buildServer (0047)', () => {
  it('constructs without throwing given a tool list', () => {
    expect(() => buildServer({}, buildTools({}))).not.toThrow();
  });
});

describe('SERVER_INSTRUCTIONS (0048)', () => {
  it('mentions both tool categories and the token requirement', () => {
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_doctor');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_create_tournament');
    expect(SERVER_INSTRUCTIONS).toContain('COPALIBRE_MCP_TOKEN');
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(200);
  });
});
