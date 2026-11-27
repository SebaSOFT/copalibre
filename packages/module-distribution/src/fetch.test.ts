import {
  ModuleFetchError,
  assertModuleAlias,
  fetchModule,
  listPublishedVersions,
  parseModuleTagVersions,
  resolveModuleVersion,
} from './fetch.js';

const LS_REMOTE_OUTPUT = [
  'abc123\trefs/tags/football@1.0.0',
  'def456\trefs/tags/football@1.0.0^{}',
  'ghi789\trefs/tags/football@1.2.0',
  'jkl012\trefs/tags/tennis@1.0.0',
  'mno345\trefs/tags/football@2.0.0-beta.1',
  'pqr678\trefs/tags/not-a-semver-tag',
].join('\n');

describe('parseModuleTagVersions', () => {
  it('extracts only versions for the requested alias', () => {
    expect(parseModuleTagVersions('football', LS_REMOTE_OUTPUT)).toEqual([
      '1.0.0',
      '1.2.0',
      '2.0.0-beta.1',
    ]);
  });

  it('deduplicates the dereferenced-tag ("^{}") line rather than double-counting it', () => {
    const versions = parseModuleTagVersions('football', LS_REMOTE_OUTPUT);
    expect(versions.filter((version) => version === '1.0.0')).toEqual(['1.0.0']);
  });

  it('returns nothing for an alias with no published tags', () => {
    expect(parseModuleTagVersions('basketball', LS_REMOTE_OUTPUT)).toEqual([]);
  });

  it('ignores a tag whose alias is a prefix of the requested one', () => {
    // "football" tags must not match a request for "foot".
    expect(parseModuleTagVersions('foot', LS_REMOTE_OUTPUT)).toEqual([]);
  });
});

describe('resolveModuleVersion', () => {
  it('picks the highest version when no range is given', () => {
    expect(resolveModuleVersion(['1.0.0', '1.2.0', '1.1.0'], undefined)).toBe('1.2.0');
  });

  it('picks the highest version satisfying a caret range', () => {
    expect(resolveModuleVersion(['1.0.0', '1.2.0', '2.0.0'], '^1.0.0')).toBe('1.2.0');
  });

  it('returns undefined when nothing satisfies the range', () => {
    expect(resolveModuleVersion(['1.0.0', '1.2.0'], '^2.0.0')).toBeUndefined();
  });

  it('returns undefined for an empty version list', () => {
    expect(resolveModuleVersion([], undefined)).toBeUndefined();
  });
});

describe('fetchModule manifest verification fallback', () => {
  const source = {
    kind: 'curated' as const,
    repositoryUrl: 'https://github.com/SebaSOFT/copalibre-modules.git',
  };

  it('falls back to default branch manifest when remote tag list has no published version', async () => {
    const dependencies = {
      listPublishedVersions: async () => [],
      runGit: async () => ({ stdout: '' }),
      pathExists: async (path: string) => path.includes('manifest.json'),
      readManifestFile: async () => JSON.stringify({ alias: 'rink-hockey', version: '1.1.0' }),
    };

    const result = await fetchModule(source, 'rink-hockey', '^1.0.0', undefined, dependencies);
    expect(result.resolvedVersion).toBe('1.1.0');
    expect(result.directory).toContain('rink-hockey');
  });

  it('falls back to default branch manifest when remote git clone --branch tag fails', async () => {
    const dependencies = {
      listPublishedVersions: async () => ['1.1.0'],
      runGit: async (args: readonly string[]) => {
        if (args.includes('--branch')) {
          throw new Error('Remote branch rink-hockey@1.1.0 not found');
        }
        return { stdout: '' };
      },
      pathExists: async (path: string) => path.includes('manifest.json'),
      readManifestFile: async () => JSON.stringify({ alias: 'rink-hockey', version: '1.1.0' }),
    };

    const result = await fetchModule(source, 'rink-hockey', '1.1.0', undefined, dependencies);
    expect(result.resolvedVersion).toBe('1.1.0');
  });
});

describe('module alias and git arguments', () => {
  const source = { kind: 'alternate' as const, repositoryUrl: 'file:///var/lib/copalibre/modules' };

  it.each([
    '../../etc',
    'football/../../x',
    '--upload-pack=touch /tmp/x',
    '-x',
    'Football',
    'a'.repeat(65),
    '',
  ])('refuses %j before running git or touching a path', async (alias) => {
    expect(() => assertModuleAlias(alias)).toThrow(ModuleFetchError);
    const calls: string[][] = [];
    await expect(
      fetchModule(source, alias, undefined, undefined, {
        listPublishedVersions: async () => ['1.0.0'],
        runGit: async (args) => {
          calls.push([...args]);
          return { stdout: '' };
        },
        pathExists: async () => true,
        readManifestFile: async () => '{}',
      }),
    ).rejects.toBeInstanceOf(ModuleFetchError);
    expect(calls).toEqual([]);
    await expect(listPublishedVersions(source, alias)).rejects.toBeInstanceOf(ModuleFetchError);
  });

  it('ends git options before the repository URL', async () => {
    const calls: string[][] = [];
    await fetchModule(source, 'football', '1.0.0', undefined, {
      listPublishedVersions: async () => ['1.0.0'],
      runGit: async (args) => {
        calls.push([...args]);
        return { stdout: '' };
      },
      pathExists: async (path: string) => path.endsWith('manifest.json'),
      readManifestFile: async () => '{}',
    });
    const clone = calls.find((args) => args[0] === 'clone');
    expect(clone?.indexOf('--')).toBe((clone?.indexOf(source.repositoryUrl) ?? 0) - 1);
  });
});

describe('git transports', () => {
  it('refuses a source on a command-running transport, even when it reached git', async () => {
    const { existsSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const marker = join(mkdtempSync(join(tmpdir(), 'copalibre-ext-')), 'ran');
    const source = { kind: 'alternate' as const, repositoryUrl: `ext::touch ${marker}` };
    await expect(listPublishedVersions(source, 'football')).rejects.toThrow(/not allowed/);
    expect(existsSync(marker)).toBe(false);
  });
});
