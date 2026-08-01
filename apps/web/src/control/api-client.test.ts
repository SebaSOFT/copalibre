import { createControlApiClient } from './lib/api-client.js';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('the control API client', () => {
  it('reads disciplines from the API rather than from a client list', async () => {
    const calls: string[] = [];
    const client = createControlApiClient({
      fetch: async (url) => {
        calls.push(String(url));
        return response([
          {
            descriptorId: 'd-1',
            version: '1.0.0',
            name: 'Fútbol',
            supportedFormats: ['round-robin'],
          },
        ]);
      },
    });

    expect(await client.listDisciplines()).toEqual([
      { descriptorId: 'd-1', version: '1.0.0', name: 'Fútbol', supportedFormats: ['round-robin'] },
    ]);
    expect(calls).toEqual(['/disciplines']);
  });

  it('creates a tournament with the descriptor version and explicit registration toggles', async () => {
    let body = '';
    let authorization = '';
    const client = createControlApiClient({
      accessToken: () => 'token-1',
      fetch: async (_url, init) => {
        body = String(init?.body);
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return response({
          tournamentId: 't-1',
          alias: 'copa-verano',
          name: 'Copa Verano',
          rulesetId: 'r-1',
        });
      },
    });

    await client.createTournament('liga-mendocina', {
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptorId: 'd-1',
      descriptorVersion: '1.0.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: true,
    });

    expect(authorization).toBe('Bearer token-1');
    expect(JSON.parse(body)).toMatchObject({
      descriptorVersion: '1.0.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: true,
    });
  });

  it('bulk reviews through the batch endpoint that records per-entrant audit rows server-side', async () => {
    let url = '';
    const client = createControlApiClient({
      fetch: async (input) => {
        url = String(input);
        return response({ applied: [], refused: [] });
      },
    });

    await client.bulkReview('liga mendocina', 'copa/verano', {
      entrantIds: ['e-1'],
      decision: 'accepted',
    });

    expect(url).toBe(
      '/organizations/liga%20mendocina/tournaments/copa%2Fverano/registrations/bulk-review',
    );
  });

  it('reviews one registration through the per-entrant endpoint', async () => {
    let url = '';
    let body = '';
    const client = createControlApiClient({
      fetch: async (input, init) => {
        url = String(input);
        body = String(init?.body);
        return response({
          entrantId: 'entrant-1',
          tournamentId: 't-1',
          status: 'withdrawn',
        });
      },
    });

    await client.reviewRegistration('liga mendocina', 'copa/verano', 'entrant/1', {
      decision: 'withdrawn',
      reason: 'Revoked from registration review',
    });

    expect(url).toBe(
      '/organizations/liga%20mendocina/tournaments/copa%2Fverano/registrations/entrant%2F1/review',
    );
    expect(JSON.parse(body)).toEqual({
      decision: 'withdrawn',
      reason: 'Revoked from registration review',
    });
  });
});
