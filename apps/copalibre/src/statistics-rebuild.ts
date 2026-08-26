import { parseArgs } from 'node:util';
import type {
  StatisticsRebuildOptions,
  StatisticsRebuildResult,
} from '@copalibre/statistics-refold';

export {
  runStatisticsRebuild,
  type StatisticsRebuildOptions,
  type StatisticsRebuildResult,
} from '@copalibre/statistics-refold';

/**
 * `copalibre statistics-rebuild` — CLI argument parsing
 * only; the recompute logic itself moved to `@copalibre/statistics-refold`
 * so `apps/api`'s admin HTTP surface can call the exact same
 * function the direct-database CLI path already used, instead of
 * duplicating it.
 */
export function parseStatisticsRebuildOptions(arguments_: readonly string[]): {
  readonly organization: string;
  readonly tournament?: string;
} {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      organization: { type: 'string' },
      tournament: { type: 'string' },
    },
    strict: true,
  });
  const organization = required(parsed.values.organization, '--organization');
  const tournament = parsed.values.tournament;
  return { organization, ...(tournament === undefined ? {} : { tournament }) };
}

/**
 * The authenticated HTTP path mirrors `create-admin.ts`'s `fetch()`
 * precedent — no database import at all. Used when a stored credential
 * exists for `apiUrl` (`StatisticsRebuildCommand`'s dual-path dispatch); the
 * direct-database `runStatisticsRebuild` above stays the fallback otherwise.
 */
export async function runStatisticsRebuildOverHttp(
  apiUrl: string,
  token: string,
  options: StatisticsRebuildOptions,
  requestFetch: typeof fetch = fetch,
): Promise<StatisticsRebuildResult> {
  const target = new URL(
    `/organizations/${encodeURIComponent(options.organization)}/statistics/rebuild`,
    apiUrl,
  );
  const response = await requestFetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(
      options.tournament === undefined ? {} : { tournamentAlias: options.tournament },
    ),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => undefined)) as
    (StatisticsRebuildResult & { readonly message?: unknown }) | undefined;
  if (!response.ok) {
    throw new Error(
      `statistics-rebuild returned HTTP ${response.status}${messageSuffix(body?.message)}`,
    );
  }
  if (!body) throw new Error('statistics-rebuild did not return a result');
  return body;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function messageSuffix(message: unknown): string {
  return typeof message === 'string' ? `: ${message}` : '';
}
