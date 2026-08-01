import { buildRobots } from '@copalibre/routing';

/** Generated from the routing package, so the disallow list cannot drift. */
export function GET({ site }: { site?: URL }): Response {
  return new Response(buildRobots(site?.toString() ?? 'http://localhost:4321'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
