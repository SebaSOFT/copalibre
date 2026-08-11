import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = join(import.meta.dirname, '../../..');
const API_REFERENCE_OUTPUT = join(REPOSITORY_ROOT, 'apps/web/dist/client/help/api-reference/index.html');

async function runWorkspaceScript(workspace: string, script: string): Promise<void> {
  await execFileAsync('yarn', ['workspace', workspace, 'run', script], {
    cwd: REPOSITORY_ROOT,
  });
}

describe('help static build (integration)', () => {
  it('renders the API reference without an API process', async () => {
    // These are build-time dependencies only; no API server is started here.
    // @copalibre/domain joined this list in 0053: language-preference.ts
    // (0051) imports it, and 0053 is the first change to make that file
    // reachable from a real build (ControlShell's ControlIntl).
    await runWorkspaceScript('@copalibre/domain', 'build');
    await runWorkspaceScript('@copalibre/routing', 'build');
    await runWorkspaceScript('@copalibre/realtime', 'build');
    await runWorkspaceScript('@copalibre/design-tokens', 'build:tokens');
    await runWorkspaceScript('@copalibre/web', 'verify:docs');

    const output = readFileSync(API_REFERENCE_OUTPUT, 'utf8');
    expect(output).toContain('id="api-reference"');
    expect(output).toContain("url: '/openapi/v1.json'");
    expect(output).toContain('hideTestRequestButton: true');
  }, 120_000);
});
