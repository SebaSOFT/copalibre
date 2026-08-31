import {
  DESCRIPTOR_FIELD_EXPLANATIONS,
  DISCIPLINE_DESCRIPTOR_SCHEMA,
  fixtureDescriptor,
  validateDisciplineDescriptorDocument,
} from '@copalibre/domain';
import { descriptorAuthoringTools } from './descriptor-authoring-tools.js';

function toolNamed(name: string) {
  const tool = descriptorAuthoringTools().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named "${name}"`);
  return tool;
}

describe('descriptorAuthoringTools', () => {
  it('always registers exactly the two descriptor-authoring tools', () => {
    const names = descriptorAuthoringTools().map((tool) => tool.name);
    expect(names).toEqual(['copalibre_descriptor_schema', 'copalibre_descriptor_validate']);
  });

  it('describes what each tool does and that none needs an API token', () => {
    for (const tool of descriptorAuthoringTools()) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description.toLowerCase()).toContain('token');
    }
  });

  // 4.1 — availability with no token, and no HTTP surface reached
  it('copalibre_descriptor_schema succeeds with no token configured and no network available', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network should never be reached by this tool');
    }) as typeof fetch;
    try {
      const tool = toolNamed('copalibre_descriptor_schema');
      const text = await tool.handler({});
      expect(JSON.parse(text)).toHaveProperty('schema');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('copalibre_descriptor_validate succeeds with no token configured and no network available', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network should never be reached by this tool');
    }) as typeof fetch;
    try {
      const tool = toolNamed('copalibre_descriptor_validate');
      const document = { ...fixtureDescriptor() } as Record<string, unknown>;
      delete document.descriptorId;
      const text = await tool.handler({ descriptor: document });
      expect(JSON.parse(text)).toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2.1 — the served schema is byte-identical to the validator's own
  it('copalibre_descriptor_schema returns the exact schema object the validator uses', async () => {
    const tool = toolNamed('copalibre_descriptor_schema');
    const text = await tool.handler({});
    const parsed = JSON.parse(text) as { schema: unknown };
    expect(parsed.schema).toEqual(DISCIPLINE_DESCRIPTOR_SCHEMA);
  });

  it('copalibre_descriptor_schema includes the field explanations module verbatim', async () => {
    const tool = toolNamed('copalibre_descriptor_schema');
    const text = await tool.handler({});
    const parsed = JSON.parse(text) as { fieldExplanations: Record<string, string> };
    expect(parsed.fieldExplanations).toEqual(DESCRIPTOR_FIELD_EXPLANATIONS);
    expect(parsed.fieldExplanations['availableFormats']).toBeTruthy();
  });

  // 4.2 — validation parity: the tool and the installation path agree
  it.each([
    { label: 'a valid descriptor', mutate: (doc: Record<string, unknown>) => doc, expectOk: true },
    {
      label: 'a descriptor missing a required member',
      mutate: (doc: Record<string, unknown>) => {
        const next = { ...doc };
        delete next.statistics;
        return next;
      },
      expectOk: false,
    },
    {
      label: 'a descriptor with a duplicated statistic code',
      mutate: (doc: Record<string, unknown>) => ({
        ...doc,
        statistics: [
          { code: 'points', label: 'Points', aggregation: 'sum' },
          { code: 'points', label: 'Puntos', aggregation: 'max' },
        ],
      }),
      expectOk: false,
    },
    {
      label: 'a descriptor with an unsupported aggregation mode',
      mutate: (doc: Record<string, unknown>) => ({
        ...doc,
        statistics: [{ code: 'strikes', label: 'Strikes', aggregation: 'median' }],
      }),
      expectOk: false,
    },
  ])(
    '$label gets the same verdict from the tool and from the installation path',
    async ({ mutate, expectOk }) => {
      const base = { ...fixtureDescriptor() } as Record<string, unknown>;
      delete base.descriptorId;
      const document = mutate(base);

      const installationResult = validateDisciplineDescriptorDocument(document);
      const tool = toolNamed('copalibre_descriptor_validate');
      const toolResult = JSON.parse(await tool.handler({ descriptor: document })) as {
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

  it('copalibre_descriptor_validate names the offending path for an invalid candidate', async () => {
    const tool = toolNamed('copalibre_descriptor_validate');
    const text = await tool.handler({
      descriptor: { statistics: [{ code: 'x', label: 'X', aggregation: 'sum', derived: true }] },
    });
    const result = JSON.parse(text) as { ok: boolean; error: string; field?: string };
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('copalibre_descriptor_validate rejects a non-object candidate', async () => {
    const tool = toolNamed('copalibre_descriptor_validate');
    await expect(tool.handler({ descriptor: 'not an object' })).rejects.toThrow(
      'descriptor must be a JSON object',
    );
  });
});
