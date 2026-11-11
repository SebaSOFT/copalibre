import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReservedOrganizationAlias } from '@copalibre/domain';

/**
 * An organization alias is the first path segment of its public pages and
 * of `/control/{alias}`. Every name a route already takes at either level
 * must be reserved, or a new organization could take it and become
 * unreachable. This test collects those names from the places that define
 * routes and fails, naming the source, when one is not on the list.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ALIAS_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface RouteName {
  readonly name: string;
  readonly source: string;
}

/** A page or public entry's route segment: `health.ts` is `health`, `index` and `[param]` name none. */
function entrySegment(entry: string): string | undefined {
  if (entry.startsWith('[') || entry.startsWith('.')) return undefined;
  const segment = entry.replace(/\.(astro|ts|js|mjs|md|mdx)$/, '');
  return segment === 'index' ? undefined : segment;
}

function directoryNames(relativeDirectory: string): RouteName[] {
  return readdirSync(join(repoRoot, relativeDirectory)).flatMap((entry) => {
    const name = entrySegment(entry);
    return name === undefined ? [] : [{ name, source: `${relativeDirectory}/${entry}` }];
  });
}

/** First segments of the literal paths a Caddyfile matches; regular expressions are skipped. */
function caddyNames(relativeFile: string): RouteName[] {
  const names: RouteName[] = [];
  for (const line of readFileSync(join(repoRoot, relativeFile), 'utf8').split('\n')) {
    const code = line.replace(/#.*$/, '').trim();
    const literal = /^(?:@\S+\s+)?(?:path|handle|handle_path|redir)\s+(.*?)\s*\{?$/.exec(code);
    if (!literal?.[1]) continue;
    for (const token of literal[1].split(/\s+/)) {
      const segment = /^\/([^/*{}]+)/.exec(token)?.[1];
      if (segment) names.push({ name: segment, source: relativeFile });
    }
  }
  return names;
}

function parserNames(): RouteName[] {
  const relativeFile = 'packages/routing/src/control-path-parser.ts';
  const source = readFileSync(join(repoRoot, relativeFile), 'utf8');
  return [...source.matchAll(/organizationAlias === '([^']+)'/g)].map((match) => ({
    name: match[1] ?? '',
    source: relativeFile,
  }));
}

function routeNames(): RouteName[] {
  return [
    ...directoryNames('apps/web/src/pages'),
    ...directoryNames('apps/web/src/pages/control'),
    ...directoryNames('apps/web/public'),
    ...caddyNames('deploy/gateway/Caddyfile'),
    ...caddyNames('deploy/web/Caddyfile'),
    ...parserNames(),
  ];
}

describe('reserved organization aliases follow the routes', () => {
  const names = routeNames();

  it('collects names from every source, so it cannot pass on an empty list', () => {
    const collected = new Set(names.map((route) => route.name));
    for (const expected of ['tv', 'invitations', 'control', 'app', 'api', 'events', 'callback']) {
      expect(collected).toContain(expected);
    }
  });

  it('reserves every route name an organization alias could take', () => {
    const unreserved = names
      .filter((route) => ALIAS_FORMAT.test(route.name))
      .filter((route) => !isReservedOrganizationAlias(route.name))
      .map((route) => `${route.name} (${route.source})`);
    expect(unreserved).toEqual([]);
  });
});
