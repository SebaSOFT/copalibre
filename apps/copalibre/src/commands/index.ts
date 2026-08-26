import type { CommandClass } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { BackupCommand } from './backup-command.js';
import { CreateAdminCommand } from './create-admin-command.js';
import { DevCommand } from './dev-command.js';
import { DoctorCommand } from './doctor-command.js';
import { InitCommand } from './init-command.js';
import { LoginCommand } from './login-command.js';
import { McpCommand } from './mcp-command.js';
import { MigrateCommand } from './migrate-command.js';
import { ModuleAddCommand } from './module-add-command.js';
import { ModuleListCommand } from './module-list-command.js';
import { ModuleRemoveCommand } from './module-remove-command.js';
import { ModuleScaffoldCommand } from './module-scaffold-command.js';
import { ModuleSubmitCommand } from './module-submit-command.js';
import { ModuleValidateLocalCommand } from './module-validate-local-command.js';
import { ModuleVerifyCommand } from './module-verify-command.js';
import { RestoreCommand } from './restore-command.js';
import { RevokeLegacyPersonalAccessTokensCommand } from './revoke-legacy-personal-access-tokens-command.js';
import { StartCommand } from './start-command.js';
import { StatisticsRebuildCommand } from './statistics-rebuild-command.js';
import { UpgradeCheckCommand } from './upgrade-check-command.js';

/** Every clipanion `Command` class registered on the `copalibre` CLI. */
export const commandClasses: readonly CommandClass<CliContext>[] = [
  InitCommand,
  DoctorCommand,
  DevCommand,
  StartCommand,
  MigrateCommand,
  BackupCommand,
  RestoreCommand,
  RevokeLegacyPersonalAccessTokensCommand,
  UpgradeCheckCommand,
  CreateAdminCommand,
  LoginCommand,
  StatisticsRebuildCommand,
  ModuleAddCommand,
  ModuleListCommand,
  ModuleRemoveCommand,
  ModuleVerifyCommand,
  ModuleScaffoldCommand,
  ModuleValidateLocalCommand,
  ModuleSubmitCommand,
  McpCommand,
];
