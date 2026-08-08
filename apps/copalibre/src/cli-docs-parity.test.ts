import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_HELP, MODULE_SUBCOMMAND_HELP } from './help-text.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the real `/help/cli/commands.md` content and the real `COMMAND_HELP`/
 * `MODULE_SUBCOMMAND_HELP` tables (0044) — not a duplicated list of either —
 * so a command added to the CLI without a matching docs entry fails this test
 * instead of shipping a silently stale reference page (same technique 0043's
 * `control-help-links.test.tsx` used for control-panel help pages).
 */
describe('the CLI command reference docs page stays in sync with COMMAND_HELP (0044)', () => {
  const commandsPage = readFileSync(
    resolve(SOURCE_DIRECTORY, '../../web/src/content/docs/help/cli/commands.md'),
    'utf8',
  );

  it.each(COMMAND_HELP.map((command) => command.name))('commands.md mentions "%s"', (name) => {
    expect(commandsPage).toContain(name);
  });

  it.each(MODULE_SUBCOMMAND_HELP.map((subcommand) => subcommand.name))(
    'commands.md mentions module subcommand "%s"',
    (name) => {
      expect(commandsPage).toContain(`module ${name}`);
    },
  );
});
