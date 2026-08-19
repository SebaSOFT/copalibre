import type { APIRoute } from 'astro';
import { fetchPlayerProfile } from '../../lib/public-api-client.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const organization = url.searchParams.get('organization');
  const tournament = url.searchParams.get('tournament');
  const personId = url.searchParams.get('personId');

  if (!organization || !tournament || !personId) {
    return new Response(JSON.stringify({ message: 'Missing required parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profile = await fetchPlayerProfile(organization, tournament, personId);
  if (!profile) {
    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
