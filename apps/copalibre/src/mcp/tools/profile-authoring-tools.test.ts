import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fixtureProfile,
  PROFILE_FIELD_EXPLANATIONS,
  TOURNAMENT_PROFILE_SCHEMA,
  validateTournamentProfileDocument,
} from '@copalibre/domain';
import { validateModulePackageOrThrow } from '@copalibre/module-distribution';
import { profileAuthoringTools } from './profile-authoring-tools.js';

function toolNamed(name: string) {
  const tool = profileAuthoringTools().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named "${name}"`);
  return tool;
}

describe('profileAuthoringTools', () => {
  it('always registers exactly the two profile-authoring tools', () => {
    const names = profileAuthoringTools().map((tool) => tool.name);
    expect(names).toEqual(['copalibre_profile_schema', 'copalibre_profile_validate']);
  });

  it('describes what each tool does and that none needs an API token', () => {
    for (const tool of profileAuthoringTools()) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description.toLowerCase()).toContain('token');
    }
  });

  it('copalibre_profile_schema succeeds with no token configured and no network available', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network should never be reached by this tool');
    }) as typeof fetch;
    try {
      const tool = toolNamed('copalibre_profile_schema');
      const text = await tool.handler({});
      expect(JSON.parse(text)).toHaveProperty('schema');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('copalibre_profile_validate succeeds with no token configured and no network available', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network should never be reached by this tool');
    }) as typeof fetch;
    try {
      const tool = toolNamed('copalibre_profile_validate');
      const document = { ...fixtureProfile() } as Record<string, unknown>;
      delete document.profileId;
      const text = await tool.handler({ profile: document });
      expect(JSON.parse(text)).toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('copalibre_profile_schema returns the exact schema object the validator uses', async () => {
    const tool = toolNamed('copalibre_profile_schema');
    const text = await tool.handler({});
    const parsed = JSON.parse(text) as { schema: unknown };
    expect(parsed.schema).toEqual(TOURNAMENT_PROFILE_SCHEMA);
  });

  it('copalibre_profile_schema includes the field explanations module verbatim', async () => {
    const tool = toolNamed('copalibre_profile_schema');
    const text = await tool.handler({});
    const parsed = JSON.parse(text) as { fieldExplanations: Record<string, string> };
    expect(parsed.fieldExplanations).toEqual(PROFILE_FIELD_EXPLANATIONS);
    expect(parsed.fieldExplanations['points']).toBeTruthy();
  });

  it.each([
    { label: 'a valid profile', mutate: (doc: Record<string, unknown>) => doc, expectOk: true },
    {
      label: 'a profile with an invalid tiebreak rule',
      mutate: (doc: Record<string, unknown>) => ({
        ...doc,
        tiebreak: [
          {
            capability: 'primary-scoring',
            label: 'Scored',
            direction: 'sideways',
            missingValue: 'treat-as-zero',
          },
        ],
      }),
      expectOk: false,
    },
    {
      label: 'a profile missing a required member',
      mutate: (doc: Record<string, unknown>) => {
        const next = { ...doc };
        delete next.points;
        return next;
      },
      expectOk: false,
    },
  ])(
    '$label gets the same verdict from the tool and from the installation path',
    async ({ mutate, expectOk }) => {
      const base = { ...fixtureProfile() } as Record<string, unknown>;
      delete base.profileId;
      const document = mutate(base);

      const installationResult = validateTournamentProfileDocument(document);
      const tool = toolNamed('copalibre_profile_validate');
      const toolResult = JSON.parse(await tool.handler({ profile: document })) as {
        ok: boolean;
        field?: string;
      };

      expect(toolResult.ok).toBe(expectOk);
      expect(installationResult.ok).toBe(expectOk);
      if (!expectOk && !installationResult.ok) {
        expect(toolResult.field).toBe(installationResult.error.details?.field);
      }
    },
  );

  it('copalibre_profile_validate rejects a non-object candidate', async () => {
    const tool = toolNamed('copalibre_profile_validate');
    await expect(tool.handler({ profile: 'not an object' })).rejects.toThrow(
      'profile must be a JSON object',
    );
  });
});

describe('cross-check against installation-time validation', () => {
  it("a profile copalibre_profile_validate accepts is also accepted by module add's direct validation path", async () => {
    const base = { ...fixtureProfile() } as Record<string, unknown>;
    delete base.profileId;

    const toolResult = JSON.parse(
      await toolNamed('copalibre_profile_validate').handler({ profile: base }),
    ) as { ok: boolean };
    expect(toolResult.ok).toBe(true);

    const directory = await mkdtemp(join(tmpdir(), 'copalibre-profile-'));
    try {
      const manifest = {
        kind: 'tournament-profile',
        alias: base.alias,
        version: base.version,
        attribution: base.attribution,
        requiresCopalibre: '>=0.0.0',
        assets: [],
      };
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
      await writeFile(join(directory, 'artifact.json'), JSON.stringify(base));

      await expect(
        validateModulePackageOrThrow(directory, { runningCopalibreVersion: '1.0.0' }),
      ).resolves.toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
