export interface CommandFlag {
  readonly flag: string;
  readonly description: string;
}

export interface CommandHelp {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly flags?: readonly CommandFlag[];
}

/**
 * Single source of truth for top-level `copalibre` command help (0044). Both
 * `cli-runner.ts`'s `--help`/`-h` handling and the `/help/cli/commands.md` docs
 * page are checked against this table, so the CLI's own help output, the docs
 * page, and the real command set cannot silently drift apart from each other.
 */
export const COMMAND_HELP: readonly CommandHelp[] = [
  {
    name: 'init',
    summary: 'Write non-secret local defaults and list required secrets',
    usage: 'copalibre init [--file <path>]',
    flags: [{ flag: '--file <path>', description: 'Target env file (default: .env)' }],
  },
  {
    name: 'doctor',
    summary: 'Validate configuration and dependencies before starting',
    usage: 'copalibre doctor [--check-proxy] [--proxy-url <url>]',
    flags: [
      { flag: '--check-proxy', description: 'Also verify the reverse-proxy configuration' },
      { flag: '--proxy-url <url>', description: 'Public URL to probe when --check-proxy is set' },
    ],
  },
  {
    name: 'dev',
    summary: 'Run a development environment (containerized or hybrid)',
    usage: 'copalibre dev [--hybrid]',
    flags: [
      {
        flag: '--hybrid',
        description: 'Run infrastructure in Docker but application processes on the host',
      },
    ],
  },
  {
    name: 'start',
    summary: 'Start PostgreSQL, run doctor, then start every process role',
    usage: 'copalibre start',
  },
  {
    name: 'migrate',
    summary: 'Run pending database migrations',
    usage: 'copalibre migrate',
  },
  {
    name: 'backup',
    summary: 'Create a compressed, retention-managed backup packet under backups/',
    usage: 'copalibre backup [--file <path>] [--retain <n>] [--dry-run]',
    flags: [
      {
        flag: '--file <path>',
        description: 'Packet destination, within backups/ (default: timestamped name)',
      },
      { flag: '--retain <n>', description: 'Packets to keep after this backup (default: 5)' },
      { flag: '--dry-run', description: 'Print the backup plan without running it' },
    ],
  },
  {
    name: 'restore',
    summary: 'Restore a backup packet into a clean installation',
    usage: 'copalibre restore --file <path> (--confirm | --dry-run)',
    flags: [
      {
        flag: '--file <path>',
        description: 'Packet to restore, within the backups/ directory',
      },
      { flag: '--confirm', description: 'Required to actually run the restore' },
      { flag: '--dry-run', description: 'Print the restore plan without running it' },
    ],
  },
  {
    name: 'upgrade-check',
    summary: 'Check module compatibility and pending migrations before upgrading',
    usage: 'copalibre upgrade-check --target-version <semver>',
    flags: [
      {
        flag: '--target-version <semver>',
        description: 'CopaLibre version to check installed modules and migrations against',
      },
    ],
  },
  {
    name: 'create-admin',
    summary: 'Bootstrap the first administrator account for an organization',
    usage:
      'copalibre create-admin --organization-alias <alias> --organization-name <name> --email <email>',
  },
  {
    name: 'module',
    summary: 'Manage installed discipline and tournament-profile modules',
    usage: 'copalibre module <add|list|remove|verify>',
  },
  {
    name: 'mcp',
    summary: 'Start a local stdio Model Context Protocol server for AI agents',
    usage: 'copalibre mcp',
  },
];

/**
 * `copalibre module <subcommand>` help table (0044). Kept separate from
 * `COMMAND_HELP` because these only exist under the `module` command, not at
 * the top level.
 */
export const MODULE_SUBCOMMAND_HELP: readonly CommandHelp[] = [
  {
    name: 'add',
    summary: 'Install a module by alias, optionally pinned to a version range',
    usage:
      'copalibre module add <alias>[@range] [--source <url>] [--allow-unsatisfied-capabilities]',
    flags: [
      {
        flag: '--source <url>',
        description: 'An allow-listed alternate source instead of curated',
      },
      {
        flag: '--allow-unsatisfied-capabilities',
        description: 'Install even if declared required capabilities are not yet satisfied',
      },
    ],
  },
  {
    name: 'list',
    summary: 'List installed modules, or check which have a newer published version',
    usage: 'copalibre module list [--outdated]',
    flags: [
      { flag: '--outdated', description: 'Show only modules with a newer published version' },
    ],
  },
  {
    name: 'remove',
    summary: 'Remove an installed module not referenced by any started tournament',
    usage: 'copalibre module remove <alias>',
  },
  {
    name: 'verify',
    summary: 'Re-validate every installed module against the running core version',
    usage: 'copalibre module verify',
  },
  {
    name: 'scaffold',
    summary: 'Generate a structurally-valid module package to start authoring from',
    usage:
      'copalibre module scaffold <discipline|tournament-profile> <alias> [--author <name>] ' +
      '[--licence <licence>] [--name <name>] [--source-url <url>] [--output <dir>]',
    flags: [
      { flag: '--author <name>', description: 'Attribution author (default: Unknown)' },
      { flag: '--licence <licence>', description: 'SPDX identifier (default: AGPL-3.0-only)' },
      { flag: '--name <name>', description: 'Display name (default: the alias)' },
      { flag: '--source-url <url>', description: 'Attribution source URL' },
      {
        flag: '--output <dir>',
        description: 'Where to write the module repo (default: modules/<alias>)',
      },
    ],
  },
  {
    name: 'validate-local',
    summary: 'Validate a local module package without fetching or installing it',
    usage: 'copalibre module validate-local <path>',
  },
  {
    name: 'submit',
    summary: 'Fork copalibre-modules and open a pull request for a local module',
    usage: 'copalibre module submit <path> [--upstream <owner/repo>] [--base <branch>]',
    flags: [
      {
        flag: '--upstream <owner/repo>',
        description: 'Target repository (default: SebaSOFT/copalibre-modules)',
      },
      { flag: '--base <branch>', description: 'Base branch for the pull request (default: main)' },
    ],
  },
];

export function renderTopLevelHelp(): string {
  const lines = [
    'Usage: copalibre <command> [options]',
    '',
    'Commands:',
    ...COMMAND_HELP.map((command) => `  ${command.name.padEnd(14)}${command.summary}`),
    '',
    "Run 'copalibre <command> --help' for details on a specific command.",
  ];
  return `${lines.join('\n')}\n`;
}

export function renderCommandHelp(name: string, table: readonly CommandHelp[]): string {
  const command = table.find((candidate) => candidate.name === name);
  if (!command) throw new Error(`No help registered for command "${name}"`);
  const lines = [`Usage: ${command.usage}`, '', command.summary];
  if (command.flags && command.flags.length > 0) {
    lines.push('', 'Options:');
    for (const flag of command.flags) {
      lines.push(`  ${flag.flag.padEnd(28)}${flag.description}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderModuleHelp(): string {
  const lines = [
    'Usage: copalibre module <subcommand> [options]',
    '',
    'Subcommands:',
    ...MODULE_SUBCOMMAND_HELP.map(
      (subcommand) => `  ${subcommand.name.padEnd(14)}${subcommand.summary}`,
    ),
    '',
    "Run 'copalibre module <subcommand> --help' for details on a specific subcommand.",
  ];
  return `${lines.join('\n')}\n`;
}
