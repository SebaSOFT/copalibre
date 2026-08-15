import { commandClasses } from './commands/index.js';
import {
  COMMAND_HELP,
  MODULE_SUBCOMMAND_HELP,
  renderCommandHelp,
  renderTopLevelHelp,
} from './help-text.js';

/**
 * Derived from the real registered `Command` classes' `paths`, so a new
 * command with no `COMMAND_HELP` entry fails this test (the same technique
 * `control-help-links.test.tsx` uses against `ControlRoutes.tsx`).
 */
function realTopLevelCommands(): readonly string[] {
  const names = new Set<string>();
  for (const commandClass of commandClasses) {
    for (const path of commandClass.paths ?? []) {
      const [first] = path;
      if (first) names.add(first);
    }
  }
  return [...names];
}

function realModuleSubcommands(): readonly string[] {
  const names = new Set<string>();
  for (const commandClass of commandClasses) {
    for (const path of commandClass.paths ?? []) {
      if (path[0] === 'module' && path[1]) names.add(path[1]);
    }
  }
  return [...names];
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

  it('documents the global --version flag', () => {
    expect(renderTopLevelHelp()).toContain('--version');
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
