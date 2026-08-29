import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixtureDescriptor } from '@copalibre/domain';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_EXECUTABLE = resolve(SOURCE_DIRECTORY, '../../dist/main.js');

/**
 * Drives the real `copalibre mcp` command over real stdio (openspec 0163,
 * task 6.1) — the same way an AI client actually speaks to it, rather than
 * calling `buildServer`/`buildTools` in-process as server.test.ts does.
 */
describe('copalibre mcp — descriptor authoring over stdio', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_EXECUTABLE, 'mcp'],
      env: { PATH: process.env.PATH ?? '' },
    });
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('names the descriptor-authoring tools in the handshake instructions', () => {
    const instructions = client.getInstructions();
    expect(instructions).toContain('copalibre_descriptor_schema');
    expect(instructions).toContain('copalibre_descriptor_validate');
  });

  it('lists both descriptor-authoring tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('copalibre_descriptor_schema');
    expect(names).toContain('copalibre_descriptor_validate');
  });

  it('fetches the schema', async () => {
    const result = await client.callTool({ name: 'copalibre_descriptor_schema', arguments: {} });
    const content = (result.content as { type: string; text: string }[])[0];
    expect(content?.type).toBe('text');
    const parsed = JSON.parse(content?.text ?? '{}') as {
      schema: unknown;
      fieldExplanations: unknown;
    };
    expect(parsed.schema).toBeTruthy();
    expect(parsed.fieldExplanations).toBeTruthy();
  });

  it('validates a good descriptor as ok', async () => {
    const document = { ...fixtureDescriptor() } as Record<string, unknown>;
    delete document.descriptorId;
    const result = await client.callTool({
      name: 'copalibre_descriptor_validate',
      arguments: { descriptor: document },
    });
    const content = (result.content as { type: string; text: string }[])[0];
    expect(JSON.parse(content?.text ?? '{}')).toEqual({ ok: true });
  });

  it('validates a bad descriptor and names its offending path', async () => {
    const document = { ...fixtureDescriptor() } as Record<string, unknown>;
    delete document.descriptorId;
    document.statistics = [{ code: 'x', label: 'X', aggregation: 'median' }];

    const result = await client.callTool({
      name: 'copalibre_descriptor_validate',
      arguments: { descriptor: document },
    });
    const content = (result.content as { type: string; text: string }[])[0];
    const parsed = JSON.parse(content?.text ?? '{}') as {
      ok: boolean;
      error: string;
      field?: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.toLowerCase()).toContain('aggregation');
    expect(parsed.field).toContain('statistics');
  });
});
