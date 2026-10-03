import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = join(import.meta.dirname, '../../..');
const HELP_OUTPUT = join(REPOSITORY_ROOT, 'apps/web/dist/client/help/index.html');
const GETTING_STARTED_OUTPUT = join(
  REPOSITORY_ROOT,
  'apps/web/dist/client/help/getting-started/index.html',
);

async function runWorkspaceScript(workspace: string, script: string): Promise<void> {
  await execFileAsync('yarn', ['workspace', workspace, 'run', script], {
    cwd: REPOSITORY_ROOT,
    env: process.env,
  });
}

describe('help static build (integration)', () => {
  it('renders the documentation without an API process', async () => {
    // These are build-time dependencies only; no API server is started here.
    // @copalibre/domain joined this list in language-preference.ts
    // imports it, and the first control-web pass makes that file
    // reachable from a real build (ControlShell's ControlIntl).
    await runWorkspaceScript('@copalibre/domain', 'build');
    await runWorkspaceScript('@copalibre/routing', 'build');
    await runWorkspaceScript('@copalibre/realtime', 'build');
    await runWorkspaceScript('@copalibre/tournament-engine', 'build');
    await runWorkspaceScript('@copalibre/design-tokens', 'build:tokens');
    await runWorkspaceScript('@copalibre/web', 'verify:docs');

    const help = readFileSync(HELP_OUTPUT, 'utf8');
    expect(help).toContain('/help/getting-started/');
    const gettingStarted = readFileSync(GETTING_STARTED_OUTPUT, 'utf8');
    expect(gettingStarted).toContain('On this page');
  }, 120_000);
});
