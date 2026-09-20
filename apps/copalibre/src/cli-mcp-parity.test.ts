import { CLI_MCP_PARITY } from './cli-mcp-parity.js';
import { COMMAND_HELP, MODULE_SUBCOMMAND_HELP, TOURNAMENT_SUBCOMMAND_HELP } from './help-text.js';
import { buildTools } from './mcp/server.js';

/**
 * Every real CLI command name, qualified as `module add`/`tournament
 * publish` for a subcommand — the same three source-of-truth tables
 * `cli-docs-parity.test.ts` already reads, not a duplicated list. `module`
 * and `tournament` themselves are parent commands with no direct behavior
 * of their own, replaced here by their real subcommands.
 */
function commandNames(): readonly string[] {
  const topLevel = COMMAND_HELP.filter(
    (command) => command.name !== 'module' && command.name !== 'tournament',
  ).map((command) => command.name);
  const moduleSubcommands = MODULE_SUBCOMMAND_HELP.map((subcommand) => `module ${subcommand.name}`);
  const tournamentSubcommands = TOURNAMENT_SUBCOMMAND_HELP.map(
    (subcommand) => `tournament ${subcommand.name}`,
  );
  return [...topLevel, ...moduleSubcommands, ...tournamentSubcommands];
}

/**
 * Every real MCP tool name, with the token-gated tournament-operational
 * tools included — real-looking but non-functional env values, matching how
 * `tournament-tools.test.ts` stubs network access rather than calling a
 * real server (no tool handler is ever invoked here, only `.name`).
 */
function toolNames(): readonly string[] {
  return buildTools({
    COPALIBRE_MCP_TOKEN: 'test-token',
    COPALIBRE_API_URL: 'http://api.invalid',
  }).map((tool) => tool.name);
}

describe('CLI_MCP_PARITY stays in sync with the real CLI commands and MCP tools', () => {
  const commands = commandNames();
  const tools = toolNames();

  it.each(commands)('CLI command "%s" is classified in exactly one registry entry', (name) => {
    const matches = CLI_MCP_PARITY.filter((entry) => entry.cliCommand === name);
    expect(matches).toHaveLength(1);
  });

  it.each(tools)('MCP tool "%s" is classified in exactly one registry entry', (name) => {
    const matches = CLI_MCP_PARITY.filter((entry) => entry.mcpTool === name);
    expect(matches).toHaveLength(1);
  });

  it('every registry cliCommand names a real, currently-registered CLI command', () => {
    for (const entry of CLI_MCP_PARITY) {
      if (entry.cliCommand !== undefined) {
        expect(commands).toContain(entry.cliCommand);
      }
    }
  });

  it('every registry mcpTool names a real, currently-registered MCP tool', () => {
    for (const entry of CLI_MCP_PARITY) {
      if (entry.mcpTool !== undefined) {
        expect(tools).toContain(entry.mcpTool);
      }
    }
  });

  it('every entry declares at least one of cliCommand/mcpTool', () => {
    for (const entry of CLI_MCP_PARITY) {
      expect(entry.cliCommand !== undefined || entry.mcpTool !== undefined).toBe(true);
    }
  });

  it('a cliCommand entry has exactly one of mcpTool/exemptReason, never both, never neither', () => {
    for (const entry of CLI_MCP_PARITY) {
      if (entry.cliCommand === undefined) continue;
      const sides = [entry.mcpTool !== undefined, entry.exemptReason !== undefined];
      expect(sides.filter(Boolean)).toHaveLength(1);
    }
  });

  it('an mcpTool entry has exactly one of cliCommand/exemptReason, never both, never neither', () => {
    for (const entry of CLI_MCP_PARITY) {
      if (entry.mcpTool === undefined) continue;
      const sides = [entry.cliCommand !== undefined, entry.exemptReason !== undefined];
      expect(sides.filter(Boolean)).toHaveLength(1);
    }
  });
});
