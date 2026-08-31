import { Cli } from 'clipanion';
import { readCopalibreVersion, renderBanner, renderFullLogo } from './banner.js';
import type { CliContext } from './cli-context.js';
import { commandClasses } from './commands/index.js';
import {
  COMMAND_HELP,
  MODULE_SUBCOMMAND_HELP,
  renderCommandHelp,
  renderModuleHelp,
  renderTopLevelHelp,
} from './help-text.js';
import type { ProcessRunner } from './process-runner.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const VERSION_FLAGS = new Set(['--version']);
const KNOWN_COMMANDS = new Set(COMMAND_HELP.map((command) => command.name));

/**
 * Top-level entry point. Dispatch to a subcommand is clipanion's job, one
 * `Command` class per subcommand under `./commands/`, but the banner and
 * help interception run before clipanion is ever reached: a help request
 * must never trigger a subcommand's own side effects, and the banner must
 * print before any of them, including a help or unknown-command exit —
 * clipanion's own help/error rendering is never exercised.
 */
export async function runCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  processes: ProcessRunner,
): Promise<number> {
  const command = arguments_[0];
  if (command && VERSION_FLAGS.has(command)) {
    // The larger, deliberately-invoked-only mark, in place of the compact
    // per-invocation banner — stdout still carries only the
    // version, unchanged, so nothing parsing it sees any difference.
    process.stderr.write(renderFullLogo());
    process.stdout.write(`${readCopalibreVersion()}\n`);
    return 0;
  }
  process.stderr.write(renderBanner());
  if (!command || HELP_FLAGS.has(command)) {
    process.stdout.write(renderTopLevelHelp());
    return 0;
  }
  if (command === 'module') {
    const moduleHelp = moduleHelpFor(arguments_.slice(1));
    if (moduleHelp !== undefined) {
      process.stdout.write(moduleHelp);
      return 0;
    }
    const sub = arguments_[1];
    if (!MODULE_SUBCOMMAND_HELP.some((candidate) => candidate.name === sub)) {
      process.stderr.write(renderModuleHelp());
      return 64;
    }
  } else if (
    HELP_FLAGS.has(arguments_[1] ?? '') &&
    COMMAND_HELP.some((candidate) => candidate.name === command)
  ) {
    process.stdout.write(renderCommandHelp(command, COMMAND_HELP));
    return 0;
  }
  if (!KNOWN_COMMANDS.has(command)) {
    process.stderr.write(`Unknown copalibre command: ${command}\n`);
    return 64;
  }

  const cli = new Cli<CliContext>({ binaryLabel: 'CopaLibre', binaryName: 'copalibre' });
  for (const commandClass of commandClasses) cli.register(commandClass);
  const context: CliContext = { ...Cli.defaultContext, env: environment, processes };
  return cli.run([...arguments_], context);
}

/**
 * Returns rendered help text for a `module` help request, or `undefined`
 * when `arguments_` is not a help request and dispatch should proceed
 * normally.
 */
function moduleHelpFor(arguments_: readonly string[]): string | undefined {
  const [sub, next] = arguments_;
  if (!sub || HELP_FLAGS.has(sub)) return renderModuleHelp();
  if (HELP_FLAGS.has(next ?? '') && MODULE_SUBCOMMAND_HELP.some((c) => c.name === sub)) {
    return renderCommandHelp(sub, MODULE_SUBCOMMAND_HELP);
  }
  return undefined;
}
