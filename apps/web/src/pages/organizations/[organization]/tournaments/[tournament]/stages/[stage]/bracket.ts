import type { APIRoute } from 'astro';
import { fetchBracket } from '../../../../../../../lib/public-api-client.ts';

export const prerender = false;

/** The bracket counterpart of the `live` route beside it: same address as the API's, same reason. */
export const GET: APIRoute = async ({ params }) => {
  const organization = params['organization'];
  const tournament = params['tournament'];
  const stage = Number(params['stage']);
  if (!organization || !tournament || !Number.isSafeInteger(stage) || stage < 1) {
    return new Response('Missing required parameters', { status: 400 });
  }

  const bracket = await fetchBracket(organization, tournament, stage);
  if (!bracket) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(bracket), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
