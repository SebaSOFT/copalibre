export type SeedCommand =
  | { readonly kind: 'catalogue' }
  | { readonly kind: 'demo-list' }
  | { readonly kind: 'demo-load'; readonly alias: string }
  | { readonly kind: 'invalid'; readonly message: string };

export const USAGE = [
  'usage: seed                      install the default module catalogue',
  '       seed demo --list          list the available demo datasets',
  '       seed demo <dataset>       load a demo dataset (needs its discipline installed)',
].join('\n');

/**
 * What `seed` was asked to do. No arguments keep the original behaviour (install the module catalogue and
 * nothing else), so existing deployments are unaffected; demo data is only ever loaded by naming it.
 */
export function parseSeedArguments(argv: readonly string[]): SeedCommand {
  const [command, ...rest] = argv;
  if (command === undefined) return { kind: 'catalogue' };
  if (command !== 'demo') {
    return { kind: 'invalid', message: `unknown command "${command}"\n${USAGE}` };
  }
  if (rest.length === 1 && rest[0] === '--list') return { kind: 'demo-list' };
  if (rest.length === 1 && rest[0] !== undefined && !rest[0].startsWith('-')) {
    return { kind: 'demo-load', alias: rest[0] };
  }
  return { kind: 'invalid', message: `"demo" takes a dataset alias or --list\n${USAGE}` };
}
