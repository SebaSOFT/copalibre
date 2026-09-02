import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bestOfFiveWinCondition,
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

    expect(catalogue.disciplines.map((document) => document.alias)).toEqual([
      'basketball',
      'football',
      'tennis',
    ]);
    expect(catalogue.profiles.map((document) => document.alias)).toEqual([
      'copa-eliminacion',
      'grupos-y-playoff',
      'liga-ida-vuelta',
    ]);
    expect(catalogue.assets.map((asset) => asset.reference.key)).toEqual([
      'modules/basketball/1.0.0/basketball-01.jpg',
      'modules/football/1.3.0/football-01.jpg',
      'modules/tennis/1.2.0/tennis-01.jpg',
    ]);
    expect(catalogue.assets.every((asset) => asset.body.byteLength > 0)).toBe(true);
    expect(catalogue.disciplines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alias: 'basketball',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
        expect.objectContaining({
          alias: 'football',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
        expect.objectContaining({
          alias: 'tennis',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
      ]),
    );
    expect(catalogue.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alias: 'copa-eliminacion',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
        expect.objectContaining({
          alias: 'grupos-y-playoff',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
        expect.objectContaining({
          alias: 'liga-ida-vuelta',
          description: expect.objectContaining({ en: expect.any(String) }),
        }),
      ]),
    );
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

    expect(catalogue.reservedAliases).toEqual([
      'basketball',
      'copa-eliminacion',
      'football',
      'grupos-y-playoff',
      'liga-ida-vuelta',
      'tennis',
    ]);
    for (const profile of catalogue.profiles) {
      expect(profile).not.toHaveProperty('descriptorId');
      expect(profile).not.toHaveProperty('descriptorVersion');
    }
  });

  it('documents expression-mode parameters in a shipped discipline', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const tennis = catalogue.disciplines.find((descriptor) => descriptor.alias === 'tennis');
    if (!tennis) throw new Error('Expected tennis catalogue document');

    const serialized = JSON.stringify(tennis.winCondition);
    expect(serialized).toContain('"expression":true');
    expect(serialized).toContain('{{ 1 + 1 }}');
  });

  it("declares football's foul and throw-in outcome-choice workflows against real sibling event codes", async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const football = catalogue.disciplines.find((descriptor) => descriptor.alias === 'football');
    if (!football) throw new Error('Expected football catalogue document');
    const codes = new Set(football.eventDefinitions.map((definition) => definition.code));

    const foul = football.eventDefinitions.find((definition) => definition.code === 'foul');
    const throwIn = football.eventDefinitions.find((definition) => definition.code === 'throw-in');
    if (!foul?.workflow || !throwIn?.workflow) {
      throw new Error('Expected foul and throw-in to declare an outcome-choice workflow');
    }

    // Loading the default catalogue already runs every document through
    // validateDisciplineDescriptorDocument, which rejects a dangling
    // `workflow.options[].definitionCode` — a load that reaches this point at
    // all already proves the references resolve. This asserts it explicitly,
    // and pins the exact outcome vocabulary so a future edit that silently
    // drops one is caught here rather than only in the console.
    expect(foul.workflow.options.map((option) => option.definitionCode).sort()).toEqual(
      ['foul-play-on', 'free-kick-awarded', 'penalty-awarded', 'red-card', 'yellow-card'].sort(),
    );
    expect(throwIn.workflow.options.map((option) => option.definitionCode).sort()).toEqual(
      ['foul-throw', 'throw-in-taken'].sort(),
    );
    for (const option of [...foul.workflow.options, ...throwIn.workflow.options]) {
      expect(codes.has(option.definitionCode)).toBe(true);
    }

    // Card outcomes reuse football's existing card events (design.md) rather
    // than declaring foul-scoped copies, so they feed the collectors already
    // wired to `yellow-card`/`red-card` with no new collector.
    const collectorCodes = (football.collectors ?? []).flatMap((collector) =>
      collector.source.kind === 'event' ? collector.source.definitionCodes : [],
    );
    expect(collectorCodes).toContain('yellow-card');
    expect(collectorCodes).toContain('red-card');
    expect(collectorCodes).not.toEqual(
      expect.arrayContaining(['foul', 'foul-play-on', 'free-kick-awarded', 'penalty-awarded']),
    );
  });

  it('declares football 1.3.0 offside, VAR review, penalty shootout, and stoppage time', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const football = catalogue.disciplines.find((descriptor) => descriptor.alias === 'football');
    if (!football) throw new Error('Expected football catalogue document');
    expect(football.version).toBe('1.3.0');

    const codes = new Set(football.eventDefinitions.map((definition) => definition.code));
    expect(codes.has('offside')).toBe(true);
    expect(codes.has('stoppage-time-announced')).toBe(true);

    const varReview = football.eventDefinitions.find(
      (definition) => definition.code === 'var-review',
    );
    if (!varReview?.workflow) {
      throw new Error('Expected var-review to declare an outcome-choice workflow');
    }

    expect(varReview.workflow.options.map((option) => option.definitionCode).sort()).toEqual(
      [
        'red-card',
        'var-card-rescinded',
        'var-goal-disallowed',
        'var-penalty-overturned',
        'var-play-stands',
      ].sort(),
    );

    for (const option of varReview.workflow.options) {
      expect(codes.has(option.definitionCode)).toBe(true);
    }

    expect(football.segmentTypes.map((segment) => segment.name)).toContain('penalty-shootout');
  });

  it('declares tennis 1.2.0 doubles label and best-of-five win condition matching domain builder', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const tennis = catalogue.disciplines.find((descriptor) => descriptor.alias === 'tennis');
    if (!tennis) throw new Error('Expected tennis catalogue document');
    expect(tennis.version).toBe('1.2.0');

    const uiMetadata = tennis.uiMetadata as {
      participantTypeLabels?: Record<string, unknown>;
      winConditions?: readonly {
        id: string;
        label: unknown;
        script?: unknown;
        rules?: unknown;
      }[];
    };

    expect(uiMetadata?.participantTypeLabels?.team).toEqual(
      expect.objectContaining({ en: 'Doubles', es: 'Dobles' }),
    );

    const bestOfFive = uiMetadata?.winConditions?.find(
      (entry) => entry.id === 'tennis-best-of-five',
    );
    expect(bestOfFive).toBeDefined();

    const expectedScript = bestOfFiveWinCondition();
    const scriptToCompare = bestOfFive?.script ?? {
      id: bestOfFive?.id,
      rules: bestOfFive?.rules,
    };
    expect(JSON.parse(JSON.stringify(scriptToCompare))).toEqual(
      JSON.parse(JSON.stringify(expectedScript)),
    );
  });

  it('declares registration.region and registration.capacity defaults and field policies', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    for (const alias of ['football', 'tennis']) {
      const discipline = catalogue.disciplines.find((d) => d.alias === alias);
      if (!discipline) throw new Error(`Expected ${alias} catalogue document`);

      const defaults = discipline.defaults as { registration?: Record<string, unknown> };
      expect(defaults?.registration?.region).toBeNull();
      expect(defaults?.registration?.capacity).toBeNull();

      expect(discipline.fieldPolicies['registration.region']).toEqual({
        permission: { kind: 'replaced' },
        mutationClass: 'safe',
      });
      expect(discipline.fieldPolicies['registration.capacity']).toEqual({
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      });
    }
  });

  it('gives every declared event-workflow outcome-choice option a description', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const workflowOptions = catalogue.disciplines.flatMap((discipline) =>
      discipline.eventDefinitions.flatMap((definition) => definition.workflow?.options ?? []),
    );

    expect(workflowOptions.length).toBeGreaterThan(0);
    for (const option of workflowOptions) {
      expect(option.description).toBeDefined();
    }
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

  it('rejects a referenced discipline image that is absent from packaged assets', async () => {
    const catalogue = await loadDefaultModuleCatalogue();
    const discipline = catalogue.disciplines.find((candidate) => candidate.alias === 'football');
    if (!discipline) throw new Error('Expected a default discipline');
    await writeFile(join(directory, 'disciplines', 'football.json'), JSON.stringify(discipline));

    await expect(loadModuleCatalogue(directory)).rejects.toMatchObject({
      failures: expect.arrayContaining([
        expect.objectContaining({
          document: 'disciplines/football.json',
          field: 'images.0.key',
        }),
      ]),
    });
  });

  it.each([
    'modules/another-discipline/1.1.0/football-01.jpg',
    'modules/football/1.1.0/football-01.png',
    'modules/football/1.1.0/folder\\football-01.jpg',
    'modules/football/1.1.0/folder//football-01.jpg',
    'modules/football/1.1.0/./football-01.jpg',
    'modules/football/1.1.0/../football-01.jpg',
  ])('rejects a non-deterministic or unsafe packaged image key: %s', async (key) => {
    const catalogue = await loadDefaultModuleCatalogue();
    const discipline = catalogue.disciplines.find((candidate) => candidate.alias === 'football');
    if (!discipline) throw new Error('Expected football default discipline');
    await writeFile(
      join(directory, 'disciplines', 'football.json'),
      JSON.stringify({ ...discipline, images: [{ key }] }),
    );

    await expect(loadModuleCatalogue(directory)).rejects.toMatchObject({
      failures: expect.arrayContaining([
        expect.objectContaining({
          document: 'disciplines/football.json',
          field: 'images.0.key',
          message: expect.stringContaining('Image key must use'),
        }),
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
