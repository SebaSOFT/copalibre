import type { InstalledModule } from '@copalibre/persistence';
import { CURATED_MODULE_REPOSITORY } from './fetch.js';
import {
  allowListedSources,
  latestPerAlias,
  resolveSource,
  runningCopalibreVersion,
  sourceFor,
} from './operations.js';

function installedModule(overrides: Partial<InstalledModule> = {}): InstalledModule {
  return {
    moduleId: '01890000-0000-7000-8000-000000000001',
    kind: 'discipline',
    alias: 'orbital-frisbee',
    version: '1.0.0',
    documentId: '01890000-0000-7000-8000-000000000002',
    attribution: { author: 'SebaSOFT', licence: 'AGPL-3.0-only' },
    requiresCopalibre: '*',
    sourceKind: 'curated',
    sourceRepositoryUrl: CURATED_MODULE_REPOSITORY.repositoryUrl,
    installedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('runningCopalibreVersion (0085)', () => {
  it('reads COPALIBRE_VERSION from the given environment', () => {
    expect(runningCopalibreVersion({ COPALIBRE_VERSION: '1.2.3' })).toBe('1.2.3');
  });

  it('defaults to 0.0.0 when unset', () => {
    expect(runningCopalibreVersion({})).toBe('0.0.0');
  });
});

describe('allowListedSources (0085)', () => {
  it('parses a comma-separated list, trimming whitespace', () => {
    expect(
      allowListedSources({
        COPALIBRE_MODULE_SOURCE_ALLOWLIST: ' https://a.example , https://b.example',
      }),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('is empty when unset', () => {
    expect(allowListedSources({})).toEqual([]);
  });

  it('drops empty entries from stray commas', () => {
    expect(
      allowListedSources({ COPALIBRE_MODULE_SOURCE_ALLOWLIST: ',,https://a.example,' }),
    ).toEqual(['https://a.example']);
  });
});

describe('resolveSource (0085)', () => {
  it('resolves to the curated repository when no source flag is given', () => {
    expect(resolveSource(undefined, {})).toEqual(CURATED_MODULE_REPOSITORY);
  });

  it('resolves an allow-listed alternate source', () => {
    const environment = { COPALIBRE_MODULE_SOURCE_ALLOWLIST: 'https://alt.example' };
    expect(resolveSource('https://alt.example', environment)).toEqual({
      kind: 'alternate',
      repositoryUrl: 'https://alt.example',
    });
  });

  it('refuses a source that is not allow-listed', () => {
    expect(() => resolveSource('https://untrusted.example', {})).toThrow(/not allow-listed/);
  });
});

describe('sourceFor (0085)', () => {
  it('resolves a curated-sourced module back to the curated repository', () => {
    expect(sourceFor(installedModule({ sourceKind: 'curated' }))).toEqual(
      CURATED_MODULE_REPOSITORY,
    );
  });

  it('resolves an alternate-sourced module to its recorded repository URL', () => {
    expect(
      sourceFor(
        installedModule({ sourceKind: 'alternate', sourceRepositoryUrl: 'https://alt.example' }),
      ),
    ).toEqual({ kind: 'alternate', repositoryUrl: 'https://alt.example' });
  });
});

describe('latestPerAlias (0085)', () => {
  it('keeps only the highest semver version installed per alias', () => {
    const older = installedModule({ alias: 'orbital-frisbee', version: '1.0.0' });
    const newer = installedModule({ alias: 'orbital-frisbee', version: '1.2.0' });
    const other = installedModule({ alias: 'zero-g-hockey', version: '2.0.0' });

    expect(latestPerAlias([older, newer, other])).toEqual(expect.arrayContaining([newer, other]));
    expect(latestPerAlias([older, newer, other])).toHaveLength(2);
  });

  it('returns an empty array for no installed modules', () => {
    expect(latestPerAlias([])).toEqual([]);
  });
});
