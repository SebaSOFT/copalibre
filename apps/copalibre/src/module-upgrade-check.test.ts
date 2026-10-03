import type { InstalledModule } from '@copalibre/persistence';
import {
  evaluateOutdatedModules,
  formatOutdatedModules,
  type OutdatedModuleInfo,
} from './module-upgrade-check.js';

describe('module-upgrade-check', () => {
  const dummyAttribution = {
    author: 'Test Author',
    licence: 'MIT',
  };

  const installedModules: readonly InstalledModule[] = [
    {
      moduleId: 'mod-1',
      alias: 'football',
      version: '1.0.0',
      kind: 'discipline',
      requiresCopalibre: '>=1.0.0',
      sourceKind: 'curated',
      sourceRepositoryUrl: 'https://github.com/SebaSOFT/copalibre-modules.git',
      documentId: 'doc-1',
      attribution: dummyAttribution,
      installedAt: new Date().toISOString(),
    },
    {
      moduleId: 'mod-2',
      alias: 'tennis',
      version: '2.0.0',
      kind: 'discipline',
      requiresCopalibre: '>=1.0.0',
      sourceKind: 'curated',
      sourceRepositoryUrl: 'https://github.com/SebaSOFT/copalibre-modules.git',
      documentId: 'doc-2',
      attribution: dummyAttribution,
      installedAt: new Date().toISOString(),
    },
  ];

  describe('evaluateOutdatedModules', () => {
    it('detects newer versions in published registry', async () => {
      const mockFetcher = async (_source: unknown, alias: string) => {
        if (alias === 'football') return ['1.0.0', '1.1.0', '1.2.0'];
        if (alias === 'tennis') return ['2.0.0'];
        return [];
      };

      const result = await evaluateOutdatedModules(installedModules, mockFetcher);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        alias: 'football',
        kind: 'discipline',
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        upgradeType: 'minor',
        sourceKind: 'curated',
      });
    });

    it('returns empty list when all installed modules are up to date', async () => {
      const mockFetcher = async (_source: unknown, alias: string) =>
        alias === 'football' ? ['1.0.0'] : ['2.0.0'];
      const result = await evaluateOutdatedModules(installedModules, mockFetcher);
      expect(result).toHaveLength(0);
    });

    it('handles fetcher errors gracefully by skipping unreachable modules', async () => {
      const mockFetcher = async () => {
        throw new Error('Network error');
      };
      const result = await evaluateOutdatedModules(installedModules, mockFetcher);
      expect(result).toHaveLength(0);
    });
  });

  describe('formatOutdatedModules', () => {
    it('formats clean message when no modules are outdated', () => {
      const output = formatOutdatedModules([]);
      expect(output).toContain('All installed modules are up to date');
    });

    it('formats upgrade recommendations table and copyable commands', () => {
      const outdated: readonly OutdatedModuleInfo[] = [
        {
          alias: 'basketball',
          kind: 'discipline',
          currentVersion: '1.0.0',
          latestVersion: '2.0.0',
          upgradeType: 'major',
          sourceKind: 'curated',
        },
      ];

      const output = formatOutdatedModules(outdated);
      expect(output).toContain('Outdated modules detected:');
      expect(output).toContain('basketball (discipline): 1.0.0 -> 2.0.0 (major update)');
      expect(output).toContain('copalibre module add basketball@2.0.0');
    });
  });
});
