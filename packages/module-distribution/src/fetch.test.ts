import { fetchModule, parseModuleTagVersions, resolveModuleVersion } from './fetch.js';

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
