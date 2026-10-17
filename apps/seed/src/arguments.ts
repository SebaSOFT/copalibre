import { isCalendarDate } from './zoned-time.js';

/** Where the dataset's first game day lands: a calendar date, or today in its time zone. */
export type DemoAnchor =
  { readonly kind: 'today' } | { readonly kind: 'date'; readonly date: string };

/** Up to when games count as played: an instant, or the moment of loading. */
export type DemoCutoff =
  { readonly kind: 'now' } | { readonly kind: 'instant'; readonly at: number };

export type SeedCommand =
  | { readonly kind: 'catalogue' }
  | { readonly kind: 'demo-list' }
  | {
      readonly kind: 'demo-load';
      readonly alias: string;
      readonly anchor?: DemoAnchor;
      readonly playedUntil?: DemoCutoff;
    }
  | { readonly kind: 'invalid'; readonly message: string };

export const USAGE = [
  'usage: seed                      install the default module catalogue',
  '       seed demo --list          list the available demo datasets',
  '       seed demo <dataset> [--anchor <YYYY-MM-DD|today>] [--played-until <ISO-8601|now>]',
  '                                 load a demo dataset (needs its discipline installed)',
].join('\n');

/** An ISO-8601 instant names its offset, so it means the same moment wherever it is read. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * What `seed` was asked to do. No arguments keep the original behaviour (install the module catalogue and
 * nothing else), so existing deployments are unaffected; demo data is only ever loaded by naming it. Every
 * value is validated here, before any connection opens.
 */
export function parseSeedArguments(argv: readonly string[]): SeedCommand {
  const [command, ...rest] = argv;
  if (command === undefined) return { kind: 'catalogue' };
  if (command !== 'demo') {
    return { kind: 'invalid', message: `unknown command "${command}"\n${USAGE}` };
  }
  if (rest.length === 1 && rest[0] === '--list') return { kind: 'demo-list' };

  let alias: string | undefined;
  let anchor: DemoAnchor | undefined;
  let playedUntil: DemoCutoff | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] as string;
    const [flag, inline] = argument.startsWith('--') ? argument.split(/=(.*)/s, 2) : [argument];
    if (flag === '--anchor' || flag === '--played-until') {
      const value = inline ?? rest[(index += 1)];
      if (value === undefined || value === '') {
        return invalid(`${flag} needs a value`);
      }
      if (flag === '--anchor') {
        if (anchor !== undefined) return invalid('--anchor is given twice');
        if (value === 'today') anchor = { kind: 'today' };
        else if (isCalendarDate(value)) anchor = { kind: 'date', date: value };
        else return invalid(`--anchor "${value}" is neither "today" nor a YYYY-MM-DD date`);
      } else {
        if (playedUntil !== undefined) return invalid('--played-until is given twice');
        if (value === 'now') playedUntil = { kind: 'now' };
        else if (INSTANT.test(value) && !Number.isNaN(Date.parse(value)))
          playedUntil = { kind: 'instant', at: Date.parse(value) };
        else
          return invalid(
            `--played-until "${value}" is neither "now" nor an ISO-8601 instant with an offset`,
          );
      }
      continue;
    }
    if (argument.startsWith('-') || alias !== undefined) {
      return invalid('"demo" takes one dataset alias, --list, --anchor and --played-until');
    }
    alias = argument;
  }
  if (alias === undefined) return invalid('"demo" takes a dataset alias or --list');
  return {
    kind: 'demo-load',
    alias,
    ...(anchor === undefined ? {} : { anchor }),
    ...(playedUntil === undefined ? {} : { playedUntil }),
  };
}

function invalid(reason: string): SeedCommand {
  return { kind: 'invalid', message: `${reason}\n${USAGE}` };
}
