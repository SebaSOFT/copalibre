import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateModulePackage, validateModulePackageOrThrow } from './validate.js';
import { ModuleValidationError } from './errors.js';
import type { ModuleManifest } from './manifest.js';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** A structurally valid PNG signature/IHDR declaring arbitrary dimensions; image-size reads only that chunk. */
function makeOversizedPngBuffer(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type: RGBA
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const type = Buffer.from('IHDR');
  const crc = Buffer.alloc(4); // unvalidated by image-size's dimension-only read
  return Buffer.concat([signature, length, type, ihdrData, crc]);
}

const VALID_ATTRIBUTION = { author: 'Test Author', licence: 'AGPL-3.0-only' };

function validManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    kind: 'discipline',
    alias: 'orbital-frisbee',
    version: '1.0.0',
    attribution: VALID_ATTRIBUTION,
    requiresCopalibre: '>=0.0.0',
    assets: [],
    ...overrides,
  };
}

function validDisciplineDocument(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    alias: 'orbital-frisbee',
    version: '1.0.0',
    name: 'Orbital Frisbee',
    attribution: VALID_ATTRIBUTION,
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 3, maxPlayers: 7 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    winCondition: { id: 'wc', rules: [] },
    defaults: {},
    fieldPolicies: {},
    ...overrides,
  };
}

async function makeModuleDirectory(manifest: unknown, artifact: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-'));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'artifact.json'), JSON.stringify(artifact));
  return directory;
}

const OPTIONS = { runningCopalibreVersion: '1.0.0' };

describe('validateModulePackage', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('accepts a valid discipline module', async () => {
    const directory = await makeModuleDirectory(validManifest(), validDisciplineDocument());
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('rejects a manifest declaring an unknown kind', async () => {
    const directory = await makeModuleDirectory(
      { ...validManifest(), kind: 'not-a-real-kind' },
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.stage).toBe('manifest');
  });

  it('rejects when the manifest and artifact aliases disagree', async () => {
    const directory = await makeModuleDirectory(
      validManifest(),
      validDisciplineDocument({ alias: 'a-different-alias' }),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.field === 'alias')).toBe(true);
    }
  });

  it('rejects a discipline referencing an unregistered win-condition action', async () => {
    const directory = await makeModuleDirectory(
      validManifest(),
      validDisciplineDocument({
        winCondition: {
          id: 'wc',
          rules: [
            {
              id: 'r1',
              type: 'simple_rule',
              options: {},
              conditions: [],
              actions: [{ id: 'a1', type: 'not_a_real_action', options: {}, params: [] }],
            },
          ],
        },
      }),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.stage === 'registry-reference')).toBe(true);
    }
  });

  it('rejects a module reserved by the first-party catalogue', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ alias: 'football' }),
      validDisciplineDocument({ alias: 'football' }),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.stage === 'reserved-alias')).toBe(true);
    }
  });

  it('rejects a module requiring a core version this installation does not satisfy', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ requiresCopalibre: '^99.0.0' }),
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.stage === 'core-version')).toBe(true);
    }
  });

  it('rejects a module declaring an asset that is not present on disk', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'missing.png', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.stage === 'asset')).toBe(true);
    }
  });

  it('rejects an asset present on disk but not declared in the manifest', async () => {
    const directory = await makeModuleDirectory(validManifest(), validDisciplineDocument());
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    // 1x1 transparent PNG.
    await writeFile(
      join(directory, 'assets', 'undeclared.png'),
      Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    );

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failures.some(
          (failure) => failure.stage === 'asset' && failure.field === 'undeclared.png',
        ),
      ).toBe(true);
    }
  });

  it('accepts a declared asset within limits', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'assets', 'logo.png'),
      Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    );

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('rejects an asset over the configured size limit', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'logo.png'), Buffer.alloc(6 * 1024 * 1024));

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failures.some(
          (failure) => failure.stage === 'asset' && /bytes/.test(failure.message),
        ),
      ).toBe(true);
    }
  });

  it('rejects a file that is not a recognisable image', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'logo.png'), Buffer.from('not an image'));

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failures.some(
          (failure) => failure.stage === 'asset' && /recognisable/.test(failure.message),
        ),
      ).toBe(true);
    }
  });

  it('rejects a logo exceeding its declared-kind dimension limit', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'logo.png'), makeOversizedPngBuffer(2000, 2000));

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failures.some(
          (failure) => failure.stage === 'asset' && /2000x2000/.test(failure.message),
        ),
      ).toBe(true);
    }
  });

  it('rejects an unparseable manifest.json as a normal validation failure, not a throw', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-'));
    directories.push(directory);
    await writeFile(join(directory, 'manifest.json'), '{not json');
    await writeFile(join(directory, 'artifact.json'), JSON.stringify(validDisciplineDocument()));

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]?.message).toMatch(/manifest\.json/);
    }
  });

  it('rejects an artifact document failing its own schema', async () => {
    const directory = await makeModuleDirectory(validManifest(), { alias: 'orbital-frisbee' });
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.stage).toBe('artifact');
  });

  it('accepts a valid tournament-profile module with no discipline installed', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ kind: 'tournament-profile', alias: 'summer-cup' }),
      {
        alias: 'summer-cup',
        version: '1.0.0',
        name: 'Summer Cup',
        attribution: VALID_ATTRIBUTION,
        requires: [
          { capability: 'primary-scoring', satisfiedBy: ['points'], necessity: 'required' },
        ],
        stages: [{ number: 1, name: 'League', format: 'round-robin' }],
        points: { win: 3, draw: 1, loss: 0 },
        tiebreak: [],
      },
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('rejects a profile whose winConditionOverride references an unregistered action', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ kind: 'tournament-profile', alias: 'summer-cup' }),
      {
        alias: 'summer-cup',
        version: '1.0.0',
        name: 'Summer Cup',
        attribution: VALID_ATTRIBUTION,
        requires: [],
        stages: [{ number: 1, name: 'League', format: 'round-robin' }],
        points: { win: 3, draw: 1, loss: 0 },
        tiebreak: [],
        winConditionOverride: {
          id: 'wc',
          rules: [
            {
              id: 'r1',
              type: 'simple_rule',
              options: {},
              conditions: [],
              actions: [{ id: 'a1', type: 'not_a_real_action', options: {}, params: [] }],
            },
          ],
        },
      },
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.stage === 'registry-reference')).toBe(true);
    }
  });

  it('validateModulePackageOrThrow throws a ModuleValidationError on failure', async () => {
    const directory = await makeModuleDirectory(
      { ...validManifest(), kind: 'not-a-real-kind' },
      validDisciplineDocument(),
    );
    directories.push(directory);

    await expect(validateModulePackageOrThrow(directory, OPTIONS)).rejects.toBeInstanceOf(
      ModuleValidationError,
    );
  });

  it('validateModulePackageOrThrow resolves the validated module on success', async () => {
    const directory = await makeModuleDirectory(validManifest(), validDisciplineDocument());
    directories.push(directory);

    const result = await validateModulePackageOrThrow(directory, OPTIONS);
    expect(result.manifest.alias).toBe('orbital-frisbee');
  });

  it('rejects a manifest that is not an object at all', async () => {
    const directory = await makeModuleDirectory('not-an-object', validDisciplineDocument());
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.field).toBeUndefined();
  });

  it('rejects a manifest missing a required field', async () => {
    const manifestWithoutAttribution: Record<string, unknown> = { ...validManifest() };
    delete manifestWithoutAttribution.attribution;
    const directory = await makeModuleDirectory(
      manifestWithoutAttribution,
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.field).toBe('attribution');
  });

  it('rejects a manifest carrying an undeclared property', async () => {
    const directory = await makeModuleDirectory(
      { ...validManifest(), somethingUnexpected: true },
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.field).toBe('somethingUnexpected');
  });

  it('rejects a declared asset whose image format is not permitted', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ assets: [{ path: 'logo.gif', kind: 'logo' }] }),
      validDisciplineDocument(),
    );
    directories.push(directory);
    await mkdir(join(directory, 'assets'));
    // Minimal GIF87a header — a recognised, but not permitted, image format.
    await writeFile(
      join(directory, 'assets', 'logo.gif'),
      Buffer.from('GIF87a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00', 'binary'),
    );

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failures.some(
          (failure) =>
            failure.stage === 'asset' && /not one of the permitted/.test(failure.message),
        ),
      ).toBe(true);
    }
  });

  it('rejects a module whose manifest and artifact versions disagree', async () => {
    const directory = await makeModuleDirectory(
      validManifest(),
      validDisciplineDocument({ version: '2.0.0' }),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.field === 'version')).toBe(true);
    }
  });

  it('rejects a directory with no manifest.json at all, as a normal validation failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-'));
    directories.push(directory);
    await writeFile(join(directory, 'artifact.json'), JSON.stringify(validDisciplineDocument()));

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]?.message).toMatch(/Cannot read manifest\.json/);
    }
  });

  it('rejects a manifest declaring an invalid semver range', async () => {
    const directory = await makeModuleDirectory(
      validManifest({ requiresCopalibre: 'not-a-semver-range' }),
      validDisciplineDocument(),
    );
    directories.push(directory);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((failure) => failure.field === 'requiresCopalibre')).toBe(true);
    }
  });
});
