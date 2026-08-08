import { jest } from '@jest/globals';
import type { DoctorDependencies } from '../../doctor.js';
import { adminTools, doctorTool, moduleListTool, upgradeCheckTool } from './admin-tools.js';

const environment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://copalibre:secret@postgres:5432/copalibre',
  COPALIBRE_APP_URL: 'https://copalibre.example',
  COPALIBRE_BOOTSTRAP_TOKEN: 'opaque-bootstrap-token',
  COPALIBRE_JWKS_URI: 'https://identity.example/jwks.json',
  COPALIBRE_JWT_ISSUER: 'https://identity.example',
  COPALIBRE_JWT_AUDIENCE: 'copalibre',
  COPALIBRE_OIDC_CLIENT_ID: 'copalibre-web',
  COPALIBRE_EMAIL_PROVIDER: 'smtp',
  COPALIBRE_EMAIL_FROM: 'noreply@copalibre.example',
  COPALIBRE_SMTP_URL: 'smtp://smtp.example:587',
};

function fakeDoctorDependencies(overrides: Partial<DoctorDependencies> = {}): DoctorDependencies {
  return {
    lookupHost: jest.fn(async () => undefined),
    probeDatabase: jest.fn(async () => undefined),
    ensureWritable: jest.fn(async () => undefined),
    retirableModules: jest.fn(async () => []),
    objectStorageRoundTrip: jest.fn(async () => undefined),
    fetch: jest.fn(async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })),
    ...overrides,
  };
}

describe('adminTools (0047)', () => {
  it('always registers exactly the three installation-action tools', () => {
    const tools = adminTools({});
    expect(tools.map((tool) => tool.name)).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
    ]);
  });
});

describe('doctorTool (0047)', () => {
  it('reports OK when every check passes, using injected dependencies', async () => {
    const tool = doctorTool(environment, fakeDoctorDependencies());
    const text = await tool.handler({});
    expect(text).toContain('doctor: OK');
  });

  it('reports FAILED with the failing check named, when a dependency reports a failure', async () => {
    const tool = doctorTool(
      environment,
      fakeDoctorDependencies({
        probeDatabase: jest.fn(async () => {
          throw new Error('connection refused');
        }),
      }),
    );
    const text = await tool.handler({});
    expect(text).toContain('doctor: FAILED');
    expect(text).toContain('postgresql');
  });
});

describe('moduleListTool (0047)', () => {
  it('is a well-formed tool definition requiring no arguments', () => {
    const tool = moduleListTool({});
    expect(tool.name).toBe('copalibre_module_list');
    expect(tool.inputSchema).toEqual({ type: 'object' });
  });
});

describe('upgradeCheckTool (0047)', () => {
  it('requires target_version to be a string, without opening a database connection', async () => {
    const tool = upgradeCheckTool({});
    await expect(tool.handler({})).rejects.toThrow('target_version must be a string');
    await expect(tool.handler({ target_version: 42 })).rejects.toThrow(
      'target_version must be a string',
    );
  });

  it('declares target_version as a required string argument', () => {
    const tool = upgradeCheckTool({});
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: { target_version: { type: 'string', description: 'CopaLibre semver to check' } },
      required: ['target_version'],
    });
  });
});
