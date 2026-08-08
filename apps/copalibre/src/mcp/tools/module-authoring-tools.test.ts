import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moduleAuthoringTools } from './module-authoring-tools.js';

function toolNamed(name: string) {
  const tool = moduleAuthoringTools({}).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named "${name}"`);
  return tool;
}

describe('moduleAuthoringTools (0049)', () => {
  it('always registers exactly the three module-authoring tools', () => {
    const names = moduleAuthoringTools({}).map((tool) => tool.name);
    expect(names).toEqual([
      'copalibre_module_scaffold',
      'copalibre_module_validate_local',
      'copalibre_module_submit',
    ]);
  });

  it('describes what each tool does and that none needs an API token', () => {
    for (const tool of moduleAuthoringTools({})) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description.toLowerCase()).toContain('token');
    }
  });

  it('copalibre_module_scaffold produces a real, validatable package end to end', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-mcp-scaffold-test-'));
    try {
      const tool = toolNamed('copalibre_module_scaffold');
      const text = await tool.handler({
        kind: 'tournament-profile',
        alias: 'test-format',
        author: 'Test Author',
        licence: 'AGPL-3.0-only',
        output_directory: join(directory, 'test-format'),
      });
      const result = JSON.parse(text) as { moduleDirectory: string; tag: string };
      expect(result.tag).toBe('test-format@0.1.0');

      const validateTool = toolNamed('copalibre_module_validate_local');
      const validation = await validateTool.handler({ path: result.moduleDirectory });
      expect(validation).toContain('PASS test-format@0.1.0');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15000);

  it('copalibre_module_scaffold rejects an invalid kind', async () => {
    const tool = toolNamed('copalibre_module_scaffold');
    await expect(tool.handler({ kind: 'not-a-kind', alias: 'x' })).rejects.toThrow(
      'kind must be "discipline" or "tournament-profile"',
    );
  });

  it('copalibre_module_validate_local rejects a missing path', async () => {
    const tool = toolNamed('copalibre_module_validate_local');
    await expect(tool.handler({})).rejects.toThrow('path must be a non-empty string');
  });

  it('copalibre_module_submit rejects a missing path', async () => {
    const tool = toolNamed('copalibre_module_submit');
    await expect(tool.handler({})).rejects.toThrow('path must be a non-empty string');
  });
});
