import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bindCapabilities,
  type DisciplineDescriptor,
  type TournamentProfile,
} from '@copalibre/domain';
import {
  loadDefaultModuleCatalogue,
  loadModuleCatalogue,
  ModuleCatalogueValidationError,
} from './index.js';

describe('default module catalogue', () => {
  it('validates every shipped document with the public schemas', async () => {
    const catalogue = await loadDefaultModuleCatalogue();

    expect(catalogue.disciplines.map((document) => document.alias)).toEqual(['football', 'tennis']);
    expect(catalogue.profiles.map((document) => document.alias)).toEqual([
      'copa-eliminacion',
      'grupos-y-playoff',
      'liga-ida-vuelta',
    ]);
  });

  it('binds the league profile against disciplines with different statistic codes', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const league = installedProfile(
      catalogue.profiles.find((profile) => profile.alias === 'liga-ida-vuelta'),
    );
    const football = installedDescriptor(
      catalogue.disciplines.find((descriptor) => descriptor.alias === 'football'),
      '01890000-0000-7000-8000-000000000101',
    );
    const tennis = installedDescriptor(
      catalogue.disciplines.find((descriptor) => descriptor.alias === 'tennis'),
      '01890000-0000-7000-8000-000000000102',
    );

    const footballBinding = bindCapabilities(football, league);
    const tennisBinding = bindCapabilities(tennis, league);

    expect(footballBinding.ok).toBe(true);
    expect(tennisBinding.ok).toBe(true);
    if (!footballBinding.ok || !tennisBinding.ok) return;
    expect(footballBinding.value.resolved.map((entry) => entry.resolvedTo)).toEqual([
      'goals-for',
      'goals-against',
    ]);
    expect(tennisBinding.value.resolved.map((entry) => entry.resolvedTo)).toEqual([
      'matches-won',
      'matches-lost',
    ]);
    for (const stage of league.stages) {
      expect(football.availableFormats).toContain(stage.format);
      expect(tennis.availableFormats).toContain(stage.format);
    }
  });

  it('keeps profiles discipline-neutral and reserves every shipped alias', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const serializedProfiles = JSON.stringify(catalogue.profiles);

    expect(serializedProfiles).not.toContain('descriptorId');
    expect(serializedProfiles).not.toContain('disciplineId');
    expect(serializedProfiles).not.toContain('disciplineVersion');
    expect(catalogue.reservedAliases).toEqual(
      [...catalogue.disciplines, ...catalogue.profiles].map((document) => document.alias).sort(),
    );
    expect(new Set(catalogue.reservedAliases).size).toBe(catalogue.reservedAliases.length);
  });

  it('documents expression-mode parameters in a shipped discipline', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const tennis = catalogue.disciplines.find((descriptor) => descriptor.alias === 'tennis');

    expect(JSON.stringify(tennis)).toContain('"value":"{{ 1 + 1 }}"');
    expect(JSON.stringify(tennis)).toContain('"expression":true');
  });
});

describe('catalogue loader', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copalibre-module-catalogue-'));
    await mkdir(join(directory, 'disciplines'));
    await mkdir(join(directory, 'profiles'));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('aggregates invalid documents instead of stopping at the first failure', async () => {
    await writeFile(join(directory, 'disciplines', 'invalid.json'), '{}');
    await writeFile(join(directory, 'profiles', 'invalid.json'), '{not json');

    await expect(loadModuleCatalogue(directory)).rejects.toEqual(
      expect.objectContaining({
        name: 'ModuleCatalogueValidationError',
        failures: expect.arrayContaining([
          expect.objectContaining({ document: 'disciplines/invalid.json', field: 'alias' }),
          expect.objectContaining({ document: 'profiles/invalid.json' }),
        ]),
      }),
    );
  });

  it('reports an unreadable category directory with the category name', async () => {
    await rm(join(directory, 'profiles'), { force: true, recursive: true });

    await expect(loadModuleCatalogue(directory)).rejects.toBeInstanceOf(
      ModuleCatalogueValidationError,
    );
    await loadModuleCatalogue(directory).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ModuleCatalogueValidationError);
      expect((error as ModuleCatalogueValidationError).failures).toEqual(
        expect.arrayContaining([expect.objectContaining({ document: 'profiles' })]),
      );
    });
  });

  it('rejects duplicate aliases across module kinds', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const discipline = catalogue.disciplines[0];
    const profile = catalogue.profiles[0];
    if (!discipline || !profile) throw new Error('Expected default catalogue documents');
    await writeFile(join(directory, 'disciplines', 'football.json'), JSON.stringify(discipline));
    await writeFile(
      join(directory, 'profiles', 'duplicate.json'),
      JSON.stringify({ ...profile, alias: discipline.alias }),
    );
    await writeFile(join(directory, 'profiles', 'scalar.json'), JSON.stringify('not a profile'));

    await expect(loadModuleCatalogue(directory)).rejects.toMatchObject({
      failures: expect.arrayContaining([
        expect.objectContaining({ document: 'catalogue', field: 'alias' }),
        expect.objectContaining({ document: 'profiles/scalar.json', field: undefined }),
      ]),
    });
  });
});

function installedDescriptor(
  document:
    Awaited<ReturnType<typeof loadDefaultModuleCatalogue>>['disciplines'][number] | undefined,
  descriptorId: string,
): DisciplineDescriptor {
  if (!document) throw new Error('Expected catalogue discipline');
  return { ...document, descriptorId };
}

function installedProfile(
  document: Awaited<ReturnType<typeof loadDefaultModuleCatalogue>>['profiles'][number] | undefined,
): TournamentProfile {
  if (!document) throw new Error('Expected catalogue profile');
  return { ...document, profileId: '01890000-0000-7000-8000-000000000201' };
}
