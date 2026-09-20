import { jest } from '@jest/globals';
import type { DoctorDependencies } from '../../doctor.js';

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

const moduleAddDirect = jest.fn<() => Promise<unknown>>();
const moduleRemoveDirect = jest.fn<() => Promise<unknown>>();
const moduleVerifyDirect = jest.fn<() => Promise<unknown>>();
const resolveSource = jest.fn<() => unknown>();
await jest.unstable_mockModule('../../module-commands.js', () => ({
  moduleAddDirect,
  moduleRemoveDirect,
  moduleVerifyDirect,
  resolveSource,
}));

const runStatisticsRebuild = jest.fn<() => Promise<unknown>>();
await jest.unstable_mockModule('@copalibre/statistics-refold', () => ({ runStatisticsRebuild }));

const createBackupPacket = jest.fn<() => Promise<unknown>>();
await jest.unstable_mockModule('../../backup-packet.js', () => ({ createBackupPacket }));

const refuseForKubernetesMode = jest.fn<() => Promise<void>>();
await jest.unstable_mockModule('../../compose-target.js', () => ({ refuseForKubernetesMode }));

const actualPersistence = await import('@copalibre/persistence');
const databaseHandle = { destroy: jest.fn(async () => undefined) };
const createDatabase = jest.fn(() => databaseHandle);
await jest.unstable_mockModule('@copalibre/persistence', () => ({
  ...actualPersistence,
  createDatabase,
}));

const {
  adminTools,
  doctorTool,
  moduleListTool,
  upgradeCheckTool,
  moduleAddTool,
  moduleRemoveTool,
  moduleVerifyTool,
  statisticsRebuildTool,
  backupTool,
} = await import('./admin-tools.js');

describe('adminTools', () => {
  it('always registers exactly the eight installation-action tools', () => {
    const tools = adminTools({});
    expect(tools.map((tool) => tool.name)).toEqual([
      'copalibre_doctor',
      'copalibre_module_list',
      'copalibre_upgrade_check',
      'copalibre_module_add',
      'copalibre_module_remove',
      'copalibre_module_verify',
      'copalibre_statistics_rebuild',
      'copalibre_backup',
    ]);
  });

  it('describes what each tool does, when to use it, and that no token is required', () => {
    for (const tool of adminTools({})) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description.toLowerCase()).toContain('token');
    }
  });
});

describe('doctorTool', () => {
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

describe('moduleListTool', () => {
  it('is a well-formed tool definition requiring no arguments', () => {
    const tool = moduleListTool({});
    expect(tool.name).toBe('copalibre_module_list');
    expect(tool.inputSchema).toEqual({ type: 'object' });
  });
});

describe('upgradeCheckTool', () => {
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

describe('moduleAddTool', () => {
  const fakeSource = { kind: 'curated' } as unknown;

  beforeEach(() => {
    moduleAddDirect.mockReset();
    resolveSource.mockReset();
    resolveSource.mockReturnValue(fakeSource);
  });

  it('names kind/alias/version in a successful install response', async () => {
    moduleAddDirect.mockResolvedValue({
      kind: 'discipline',
      alias: 'orbital-frisbee',
      version: '1.2.0',
      unsatisfiedRequiredCapabilities: [],
    });
    const tool = moduleAddTool({});
    const text = await tool.handler({ alias: 'orbital-frisbee' });
    expect(text).toContain('"kind": "discipline"');
    expect(text).toContain('"alias": "orbital-frisbee"');
    expect(text).toContain('"version": "1.2.0"');
    expect(moduleAddDirect).toHaveBeenCalledWith(
      'orbital-frisbee',
      undefined,
      fakeSource,
      {},
      false,
    );
  });

  it('propagates an unsatisfied-capabilities failure naming the missing capabilities', async () => {
    moduleAddDirect.mockRejectedValue(
      new Error(
        'No installed discipline satisfies required capabilities: scoring. Install a ' +
          'satisfying discipline first, or pass an explicit override.',
      ),
    );
    const tool = moduleAddTool({});
    await expect(tool.handler({ alias: 'double-elimination-bracket' })).rejects.toThrow(/scoring/);
  });

  it('requires alias to be a non-empty string', async () => {
    const tool = moduleAddTool({});
    await expect(tool.handler({})).rejects.toThrow('alias must be a non-empty string');
  });
});

describe('moduleRemoveTool', () => {
  beforeEach(() => moduleRemoveDirect.mockReset());

  it('reports a successful removal', async () => {
    moduleRemoveDirect.mockResolvedValue({ alias: 'orbital-frisbee', removedCount: 2 });
    const tool = moduleRemoveTool({});
    const text = await tool.handler({ alias: 'orbital-frisbee' });
    expect(text).toContain('"alias": "orbital-frisbee"');
    expect(text).toContain('"removedCount": 2');
  });

  it('names the referencing tournament(s) when a started tournament refuses removal', async () => {
    moduleRemoveDirect.mockRejectedValue(
      new Error('Cannot remove "orbital-frisbee": referenced by started tournament(s): summer-cup'),
    );
    const tool = moduleRemoveTool({});
    await expect(tool.handler({ alias: 'orbital-frisbee' })).rejects.toThrow(/summer-cup/);
  });

  it('requires alias to be a non-empty string', async () => {
    const tool = moduleRemoveTool({});
    await expect(tool.handler({})).rejects.toThrow('alias must be a non-empty string');
  });
});

describe('moduleVerifyTool', () => {
  beforeEach(() => moduleVerifyDirect.mockReset());

  it('formats a mix of passing and failing modules the same way doctorTool formats its checks', async () => {
    moduleVerifyDirect.mockResolvedValue([
      { alias: 'orbital-frisbee', version: '1.0.0', ok: true, failures: [] },
      {
        alias: 'double-elimination-bracket',
        version: '2.0.0',
        ok: false,
        failures: [{ stage: 'checksum', message: 'artifact checksum mismatch' }],
      },
    ]);
    const tool = moduleVerifyTool({});
    const text = await tool.handler({});
    expect(text.split('\n')).toEqual([
      'verify: FAILED',
      'PASS orbital-frisbee@1.0.0',
      'FAIL double-elimination-bracket@2.0.0',
      '  [checksum] artifact checksum mismatch',
    ]);
  });

  it('reports OK when every installed module passes', async () => {
    moduleVerifyDirect.mockResolvedValue([
      { alias: 'orbital-frisbee', version: '1.0.0', ok: true, failures: [] },
    ]);
    const tool = moduleVerifyTool({});
    const text = await tool.handler({});
    expect(text).toContain('verify: OK');
  });
});

describe('statisticsRebuildTool', () => {
  beforeEach(() => {
    runStatisticsRebuild.mockReset();
    createDatabase.mockClear();
    databaseHandle.destroy.mockClear();
  });

  it('reports a successful rebuild', async () => {
    runStatisticsRebuild.mockResolvedValue({
      organizationAlias: 'copa-libre',
      matches: 12,
      figures: 48,
    });
    const tool = statisticsRebuildTool(environment);
    const text = await tool.handler({ organization_alias: 'copa-libre' });
    expect(text).toContain('"organizationAlias": "copa-libre"');
    expect(text).toContain('"figures": 48');
    expect(databaseHandle.destroy).toHaveBeenCalled();
  });

  it('refuses an unknown organization', async () => {
    runStatisticsRebuild.mockRejectedValue(new Error('No organization "ghost"'));
    const tool = statisticsRebuildTool(environment);
    await expect(tool.handler({ organization_alias: 'ghost' })).rejects.toThrow(
      'No organization "ghost"',
    );
    expect(databaseHandle.destroy).toHaveBeenCalled();
  });

  it('requires organization_alias to be a non-empty string', async () => {
    const tool = statisticsRebuildTool(environment);
    await expect(tool.handler({})).rejects.toThrow('organization_alias must be a non-empty string');
    expect(createDatabase).not.toHaveBeenCalled();
  });
});

describe('backupTool', () => {
  beforeEach(() => {
    refuseForKubernetesMode.mockReset();
    refuseForKubernetesMode.mockResolvedValue(undefined);
    createBackupPacket.mockReset();
  });

  it("names the written file and any pruned packets in a successful backup's response", async () => {
    createBackupPacket.mockResolvedValue({
      file: 'backups/copalibre-test.tar.gz',
      pruned: ['backups/copalibre-old.tar.gz'],
    });
    const tool = backupTool();
    const text = await tool.handler({ file: 'backups/copalibre-test.tar.gz' });
    expect(text).toContain('backups/copalibre-test.tar.gz');
    expect(text).toContain('backups/copalibre-old.tar.gz');
    expect(createBackupPacket).toHaveBeenCalledTimes(1);
  });

  it('returns the same refusal reason as `copalibre backup` in Kubernetes mode, writing no packet', async () => {
    refuseForKubernetesMode.mockRejectedValue(
      new Error('Not supported for kubernetes-mode instances.'),
    );
    const tool = backupTool();
    await expect(tool.handler({})).rejects.toThrow('Not supported for kubernetes-mode instances.');
    expect(createBackupPacket).not.toHaveBeenCalled();
  });

  it('reports the backup plan without writing a packet in dry-run mode', async () => {
    const tool = backupTool();
    const text = await tool.handler({ dry_run: true });
    expect(text).toContain('Backup plan');
    expect(createBackupPacket).not.toHaveBeenCalled();
  });
});
