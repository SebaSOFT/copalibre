import { SERVER_INSTRUCTIONS, buildServer, buildTools } from './server.js';

describe('buildTools', () => {
  it('registers the thirteen always-on tools when no token/API URL is configured', () => {
    const names = buildTools({}).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_module_add',
      'copalibre_module_remove',
      'copalibre_module_verify',
      'copalibre_statistics_rebuild',
      'copalibre_backup',
      'copalibre_module_scaffold',
      'copalibre_module_validate_local',
      'copalibre_module_submit',
      'copalibre_descriptor_schema',
      'copalibre_descriptor_validate',
    ]);
  });

  it('registers all eighteen tools when both COPALIBRE_MCP_TOKEN and COPALIBRE_API_URL are set', () => {
    const names = buildTools({
      COPALIBRE_MCP_TOKEN: 'token',
      COPALIBRE_API_URL: 'http://localhost:3001',
    }).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_module_add',
      'copalibre_module_remove',
      'copalibre_module_verify',
      'copalibre_statistics_rebuild',
      'copalibre_backup',
      'copalibre_module_scaffold',
      'copalibre_module_validate_local',
      'copalibre_module_submit',
      'copalibre_descriptor_schema',
      'copalibre_descriptor_validate',
      'copalibre_get_organization',
      'copalibre_list_tournaments',
      'copalibre_get_tournament',
      'copalibre_create_tournament',
      'copalibre_publish_tournament',
    ]);
  });

  it('registers only the thirteen always-on tools when a token is set without an API URL, or vice versa', () => {
    expect(buildTools({ COPALIBRE_MCP_TOKEN: 'token' })).toHaveLength(13);
    expect(buildTools({ COPALIBRE_API_URL: 'http://localhost:3001' })).toHaveLength(13);
  });
});

describe('buildServer', () => {
  it('constructs without throwing given a tool list', () => {
    expect(() => buildServer({}, buildTools({}))).not.toThrow();
  });
});

describe('SERVER_INSTRUCTIONS', () => {
  it('names all four tool categories, where the authoring contract lives, and the token requirement', () => {
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_doctor');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_module_add');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_module_remove');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_module_verify');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_statistics_rebuild');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_backup');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_module_scaffold');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_descriptor_schema');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_descriptor_validate');
    expect(SERVER_INSTRUCTIONS).toContain('llms-authoring.txt');
    expect(SERVER_INSTRUCTIONS).toContain('copalibre_create_tournament');
    expect(SERVER_INSTRUCTIONS).toContain('COPALIBRE_MCP_TOKEN');
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(200);
  });
});
