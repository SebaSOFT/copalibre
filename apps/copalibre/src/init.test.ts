import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatRequiredSecrets, writeLocalDefaults } from './init.js';

describe('copalibre init', () => {
  it('writes only non-secret defaults into a new local file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-init-'));
    const file = join(directory, '.env');

    await writeLocalDefaults(file);

    const content = await readFile(file, 'utf8');
    expect(content).toContain('COPALIBRE_APP_URL=http://localhost:4321');
    expect(content).not.toContain('BOOTSTRAP_TOKEN=');
  });

  it('lists required secret inputs without assigning values', () => {
    expect(formatRequiredSecrets()).toContain('COPALIBRE_BOOTSTRAP_TOKEN');
    expect(formatRequiredSecrets()).not.toContain('=');
  });
});
