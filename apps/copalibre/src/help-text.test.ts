import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_HELP, MODULE_SUBCOMMAND_HELP, renderCommandHelp, renderTopLevelHelp } from './help-text.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the real `cli-runner.ts` source and extracts the `case '...'` labels
 * from its top-level command switch (0044) — not a hardcoded duplicate of the
 * command list, so a new command with no `COMMAND_HELP` entry fails this test
 * instead of shipping silently undocumented (same technique 0043's
 * `control-help-links.test.tsx` used against `ControlRoutes.tsx`).
 */
function realTopLevelCommands(): readonly string[] {
  const source = readFileSync(resolve(SOURCE_DIRECTORY, 'cli-runner.ts'), 'utf8');
  const switchStart = source.indexOf('switch (command) {');
  const switchDefault = source.indexOf('default:', switchStart);
  const switchBody = source.slice(switchStart, switchDefault);
  return [...switchBody.matchAll(/case '([\w-]+)':/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

function realModuleSubcommands(): readonly string[] {
  const source = readFileSync(resolve(SOURCE_DIRECTORY, 'cli-runner.ts'), 'utf8');
  const switchStart = source.indexOf('switch (sub) {');
  const switchDefault = source.indexOf('default:', switchStart);
  const switchBody = source.slice(switchStart, switchDefault);
  return [...switchBody.matchAll(/case '([\w-]+)':/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

describe('COMMAND_HELP stays in sync with the real CLI dispatch (0044)', () => {
  const commands = realTopLevelCommands();

  it('found at least one real command to check', () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  it.each(commands)('command "%s" has a COMMAND_HELP entry', (command) => {
    expect(COMMAND_HELP.some((candidate) => candidate.name === command)).toBe(true);
  });

  it('has no COMMAND_HELP entry for a command that no longer exists', () => {
    for (const command of COMMAND_HELP) {
      expect(commands).toContain(command.name);
    }
  });
});

describe('MODULE_SUBCOMMAND_HELP stays in sync with the real module dispatch (0044)', () => {
  const subcommands = realModuleSubcommands();

  it('found at least one real module subcommand to check', () => {
    expect(subcommands.length).toBeGreaterThan(0);
  });

  it.each(subcommands)('module subcommand "%s" has a MODULE_SUBCOMMAND_HELP entry', (name) => {
    expect(MODULE_SUBCOMMAND_HELP.some((candidate) => candidate.name === name)).toBe(true);
  });
});

describe('renderTopLevelHelp', () => {
  it('lists every COMMAND_HELP command name', () => {
    const rendered = renderTopLevelHelp();
    for (const command of COMMAND_HELP) {
      expect(rendered).toContain(command.name);
    }
  });
});

describe('renderCommandHelp', () => {
  it.each(COMMAND_HELP)('renders usage and summary for "$name"', (command) => {
    const rendered = renderCommandHelp(command.name, COMMAND_HELP);
    expect(rendered).toContain(command.usage);
    expect(rendered).toContain(command.summary);
  });

  it('throws for a command with no registered help', () => {
    expect(() => renderCommandHelp('not-a-real-command', COMMAND_HELP)).toThrow();
  });
});
