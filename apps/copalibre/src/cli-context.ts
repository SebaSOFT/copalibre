import type { BaseContext } from 'clipanion';
import type { ProcessRunner } from './process-runner.js';

/**
 * Passed to every clipanion `Command` via `Cli#run`'s context argument:
 * `env`/`processes` are how a command reaches process environment and the
 * shared `docker`/`yarn` spawner.
 */
export interface CliContext extends BaseContext {
  readonly env: NodeJS.ProcessEnv;
  readonly processes: ProcessRunner;
}
