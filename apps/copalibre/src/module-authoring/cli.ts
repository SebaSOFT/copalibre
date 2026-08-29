import { parseArgs } from 'node:util';
import { submitModule, type ModuleKind } from '@copalibre/module-distribution';
import { systemProcessRunner } from '../process-runner.js';
import { scaffoldModule } from './scaffold.js';
import { validateLocalModule } from './validate-local.js';

const MODULE_KINDS: readonly ModuleKind[] = ['discipline', 'tournament-profile'];

function isModuleKind(value: string): value is ModuleKind {
  return (MODULE_KINDS as readonly string[]).includes(value);
}

/** `apps/*`'s own `role.ts` files read the same variable the same way. */
function runningCopalibreVersion(environment: NodeJS.ProcessEnv): string {
  return environment.COPALIBRE_VERSION ?? '0.0.0';
}

/** `copalibre module scaffold <discipline|tournament-profile> <alias>`. */
export async function moduleScaffoldCommand(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      author: { type: 'string' },
      licence: { type: 'string' },
      name: { type: 'string' },
      'source-url': { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  });
  const [kind, alias] = parsed.positionals;
  if (!kind || !alias || !isModuleKind(kind)) {
    throw new Error(
      'Usage: copalibre module scaffold <discipline|tournament-profile> <alias> [--author <name>] ' +
        '[--licence <licence>] [--name <name>] [--source-url <url>] [--output <dir>]',
    );
  }
  const result = await scaffoldModule(
    {
      kind,
      alias,
      author: parsed.values.author ?? 'Unknown',
      licence: parsed.values.licence ?? 'AGPL-3.0-only',
      ...(parsed.values.name === undefined ? {} : { name: parsed.values.name }),
      ...(parsed.values['source-url'] === undefined
        ? {}
        : { sourceUrl: parsed.values['source-url'] }),
      outputDirectory: parsed.values.output ?? `modules/${alias}`,
    },
    systemProcessRunner,
  );
  process.stdout.write(
    `Scaffolded ${kind} "${alias}" at ${result.moduleDirectory} (tag ${result.tag})\n` +
      `Next: copalibre module validate-local ${result.moduleDirectory}\n`,
  );
  return 0;
}

/** `copalibre module validate-local <path>`. */
export async function moduleValidateLocalCommand(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const [path] = arguments_;
  if (!path) throw new Error('Usage: copalibre module validate-local <path>');
  const result = await validateLocalModule(path, runningCopalibreVersion(environment));
  process.stdout.write(`${result.lines.join('\n')}\n`);
  return result.ok ? 0 : 1;
}

/** `copalibre module submit <path>`. */
export async function moduleSubmitCommand(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      upstream: { type: 'string' },
      base: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  });
  const [path] = parsed.positionals;
  if (!path)
    throw new Error(
      'Usage: copalibre module submit <path> [--upstream <owner/repo>] [--base <branch>]',
    );
  const result = await submitModule({
    modulePath: path,
    ...(parsed.values.upstream === undefined ? {} : { upstreamRepository: parsed.values.upstream }),
    ...(parsed.values.base === undefined ? {} : { baseBranch: parsed.values.base }),
  });
  process.stdout.write(
    `Opened pull request on branch "${result.branch}": ${result.pullRequestUrl}\n`,
  );
  return 0;
}
