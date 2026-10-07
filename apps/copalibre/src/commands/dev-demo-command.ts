import { access } from 'node:fs/promises';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { refuseForKubernetesMode } from '../compose-target.js';
import { runCommand } from '../command-support.js';
import { hybridEnvironment } from './dev-command.js';
import { parseComposePs, type ComposeServiceRow } from './status-command.js';

const DEV_COMPOSE_FILE = 'docker-compose.dev.yml';

/**
 * The dev Garage service as the host sees it (port 9000 is published), with the key `object-storage-init`
 * imports. These must match `docker-compose.dev.yml`'s `x-development-object-storage` so the host loader and the
 * containerised API share one bucket; a test compares them.
 */
export const DEV_OBJECT_STORAGE: Readonly<Record<string, string>> = {
  COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
  COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'GK636f70616c69627265646576',
  COPALIBRE_OBJECT_STORAGE_SECRET_KEY:
    '636f70616c696272655f6465765f6f6e6c795f6f626a6563745f73746f726521',
  COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-dev',
  COPALIBRE_OBJECT_STORAGE_REGION: 'garage',
};

/** Services the loader needs: the database, and the object store with its bucket initialised. */
const REQUIRED_SERVICES = ['postgres', 'object-storage', 'object-storage-init'] as const;

function isUp(service: ComposeServiceRow | undefined): boolean {
  return (
    service?.State === 'running' &&
    (service.Health === undefined || service.Health === '' || service.Health === 'healthy')
  );
}

/**
 * `copalibre dev demo [--list] [<dataset>]`: loads a committed demo dataset into the running development stack
 * from the host, through the seed application's `demo` subcommand. It only ever targets
 * `docker-compose.dev.yml` in a checkout, never an installation.
 */
export class DevDemoCommand extends Command<CliContext> {
  static override paths = [['dev', 'demo']];

  list = Option.Boolean('--list', false);
  dataset = Option.String({ required: false });

  async execute(): Promise<number> {
    return runCommand('dev demo', async () => {
      await refuseForKubernetesMode('demo data is for development stacks only');
      try {
        await access(DEV_COMPOSE_FILE);
      } catch {
        throw new Error(
          `${DEV_COMPOSE_FILE} not found here — run this from your CopaLibre checkout`,
        );
      }
      const environment = {
        ...hybridEnvironment(this.context.env),
        ...DEV_OBJECT_STORAGE,
        // An explicit value in the caller's environment wins over the dev defaults.
        ...Object.fromEntries(
          Object.keys(DEV_OBJECT_STORAGE)
            .filter((key) => this.context.env[key])
            .map((key) => [key, this.context.env[key]]),
        ),
      };
      const seed = ['workspace', '@copalibre/seed', 'start', 'demo'];

      if (this.list) return this.context.processes.run('yarn', [...seed, '--list'], environment);
      if (!this.dataset) {
        throw new Error('name a dataset to load, or pass --list to see what is available');
      }

      await this.requireInfrastructure();
      return this.context.processes.run('yarn', [...seed, this.dataset], environment);
    });
  }

  private async requireInfrastructure(): Promise<void> {
    const capture = this.context.processes.capture;
    if (!capture) throw new Error('this runner cannot inspect Docker Compose');
    const result = await capture.call(this.context.processes, 'docker', [
      'compose',
      '-f',
      DEV_COMPOSE_FILE,
      '--profile',
      'infrastructure',
      'ps',
      '--format',
      'json',
    ]);
    const services = result.code === 0 ? parseComposePs(result.stdout) : [];
    const missing = REQUIRED_SERVICES.filter(
      (name) => !isUp(services.find((service) => service.Service === name)),
    );
    if (missing.length > 0) {
      throw new Error(
        `the development stack is not up (${missing.join(', ')}). ` +
          `Start it first: copalibre dev, or docker compose -f ${DEV_COMPOSE_FILE} --profile infrastructure up --detach --wait`,
      );
    }
  }
}
