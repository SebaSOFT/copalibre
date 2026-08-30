import { createControlApiClient } from './lib/api-client.js';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

describe('the control API client', () => {
  it('uses installation-wide organization and module administration endpoints', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = createControlApiClient({
      accessToken: () => 'super-token',
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        return response([]);
      },
    });
    if (
      !client.createOrganization ||
      !client.listInstalledModules ||
      !client.listOutdatedModules ||
      !client.installModule ||
      !client.removeModule ||
      !client.verifyModules
    ) {
      throw new Error('Platform administration methods must be available');
    }

    await client.createOrganization({ alias: 'liga-sur', name: 'Liga Sur' });
    await client.listInstalledModules();
    await client.listOutdatedModules();
    await client.installModule({ alias: 'football', allowUnsatisfiedCapabilities: false });
    await client.removeModule('football');
    await client.verifyModules();

    expect(calls).toEqual([
      { url: '/organizations', method: 'POST', body: { alias: 'liga-sur', name: 'Liga Sur' } },
      { url: '/admin/modules', method: 'GET' },
      { url: '/admin/modules?outdated=true', method: 'GET' },
      {
        url: '/admin/modules',
        method: 'POST',
        body: { alias: 'football', allowUnsatisfiedCapabilities: false },
      },
      { url: '/admin/modules/football', method: 'DELETE' },
      { url: '/admin/modules/verify', method: 'POST' },
    ]);
  });

  it('reads disciplines from the API rather than from a client list', async () => {
    const calls: string[] = [];
    const client = createControlApiClient({
      fetch: async (url) => {
        calls.push(String(url));
        return response([
          {
            descriptorId: 'd-1',
            version: '1.0.0',
            name: { en: 'Football', es: 'Fútbol' },
            description: { en: 'Team discipline' },
            supportedFormats: ['round-robin'],
          },
        ]);
      },
    });

    expect(await client.listDisciplines()).toEqual([
      {
        descriptorId: 'd-1',
        version: '1.0.0',
        name: { en: 'Football', es: 'Fútbol' },
        description: { en: 'Team discipline' },
        supportedFormats: ['round-robin'],
      },
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
      customScripts: [],
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

    await client.bulkReview('liga-mendocina', 'copa-verano', {
      entrantIds: ['e-1'],
      decision: 'accepted',
    });

    expect(url).toBe(
      '/organizations/liga-mendocina/tournaments/copa-verano/registrations/bulk-review',
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

    await client.reviewRegistration(
      'liga-mendocina',
      'copa-verano',
      '01800000-0000-7000-8000-000000000001',
      {
        decision: 'withdrawn',
        reason: 'Revoked from registration review',
      },
    );

    expect(url).toBe(
      '/organizations/liga-mendocina/tournaments/copa-verano/registrations/01800000-0000-7000-8000-000000000001/review',
    );
    expect(JSON.parse(body)).toEqual({
      decision: 'withdrawn',
      reason: 'Revoked from registration review',
    });
  });

  it('uses the reviewed import/export endpoints and downloads CSV and configuration JSON', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const preview = {
      importId: 'import-1',
      target: 'team' as const,
      status: 'review-ready',
      sourceHash: 'source-hash',
    };
    const client = createControlApiClient({
      accessToken: () => 'token-1',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/exports/standings')) return textResponse('stageId,standings\n');
        if (String(url).endsWith('/export')) {
          return response({
            kind: 'copalibre-tournament-configuration',
            schemaVersion: '1.0.0',
            tournament: {},
            ruleset: {},
            seasons: [],
          });
        }
        return response(preview);
      },
    });
    if (
      !client.createCsvImport ||
      !client.fetchCsvImport ||
      !client.commitCsvImport ||
      !client.downloadCsvExport ||
      !client.downloadTournamentConfiguration
    ) {
      throw new Error('CSV client methods must be available');
    }

    await client.createCsvImport('liga-mendocina', 'copa-verano', {
      target: 'team',
      sourceCsv: 'alias,name\nclub-atletico,Club Atletico\n',
    });
    await client.fetchCsvImport(
      'liga-mendocina',
      'copa-verano',
      '01800000-0000-7000-8000-000000000002',
    );
    await client.commitCsvImport(
      'liga-mendocina',
      'copa-verano',
      '01800000-0000-7000-8000-000000000002',
      'source-hash',
    );
    await expect(
      client.downloadCsvExport('liga-mendocina', 'copa-verano', 'standings'),
    ).resolves.toBe('stageId,standings\n');
    await expect(
      client.downloadTournamentConfiguration('liga-mendocina', 'copa-verano'),
    ).resolves.toMatchObject({ kind: 'copalibre-tournament-configuration' });

    expect(calls.map((call) => call.url)).toEqual([
      '/organizations/liga-mendocina/tournaments/copa-verano/imports',
      '/organizations/liga-mendocina/tournaments/copa-verano/imports/01800000-0000-7000-8000-000000000002',
      '/organizations/liga-mendocina/tournaments/copa-verano/imports/01800000-0000-7000-8000-000000000002/commit',
      '/organizations/liga-mendocina/tournaments/copa-verano/exports/standings',
      '/organizations/liga-mendocina/tournaments/copa-verano/export',
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ target: 'team' });
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ sourceHash: 'source-hash' });
    expect(new Headers(calls[3]?.init?.headers).get('authorization')).toBe('Bearer token-1');
    expect(new Headers(calls[4]?.init?.headers).get('authorization')).toBe('Bearer token-1');
  });

  it('fetches storage usage for an organization', async () => {
    let requestedUrl = '';
    const client = createControlApiClient({
      accessToken: () => 'token-admin',
      fetch: async (input) => {
        requestedUrl = String(input);
        return response({ totalBytes: 104857600, objectCount: 12 });
      },
    });

    if (!client.getStorageUsage) {
      throw new Error('getStorageUsage must be available');
    }

    const usage = await client.getStorageUsage('liga-orbital');
    expect(requestedUrl).toBe('/organizations/liga-orbital/storage-usage');
    expect(usage).toEqual({ totalBytes: 104857600, objectCount: 12 });
  });

  it('calls the competition-structure-editing and object-cleanup endpoints (openspec 0168)', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = createControlApiClient({
      accessToken: () => 'token-admin',
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        return response({});
      },
    });
    if (
      !client.fetchTournamentSettings ||
      !client.previewTournamentSettings ||
      !client.updateTournamentSettings ||
      !client.updateStage ||
      !client.deleteStage ||
      !client.renameZone ||
      !client.deleteZone ||
      !client.renameGroup ||
      !client.deleteGroup ||
      !client.listUnreferencedObjects ||
      !client.deleteObject
    ) {
      throw new Error('openspec 0168 client methods must be available');
    }

    await client.fetchTournamentSettings('liga-orbital', 'copa-verano');
    await client.previewTournamentSettings('liga-orbital', 'copa-verano', { region: 'Europe' });
    await client.updateTournamentSettings('liga-orbital', 'copa-verano', { region: 'Europe' });
    await client.updateStage('liga-orbital', 'copa-verano', 1, { name: 'Fase 1' });
    await client.deleteStage('liga-orbital', 'copa-verano', 1);
    await client.renameZone('liga-orbital', 'copa-verano', 1, 1, { name: 'Zona 1' });
    await client.deleteZone('liga-orbital', 'copa-verano', 1, 1);
    await client.renameGroup('liga-orbital', 'copa-verano', 1, 1, 1, { name: 'Grupo A' });
    await client.deleteGroup('liga-orbital', 'copa-verano', 1, 1, 1);
    await client.listUnreferencedObjects('liga-orbital');
    await client.deleteObject('liga-orbital', 'object-1');

    expect(calls).toEqual([
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/settings',
        method: 'GET',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/settings/preview',
        method: 'POST',
        body: { region: 'Europe' },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/settings',
        method: 'PUT',
        body: { region: 'Europe' },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1',
        method: 'PATCH',
        body: { name: 'Fase 1' },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/zones/1',
        method: 'PATCH',
        body: { name: 'Zona 1' },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/zones/1',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/zones/1/groups/1',
        method: 'PATCH',
        body: { name: 'Grupo A' },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/zones/1/groups/1',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/storage-usage/objects',
        method: 'GET',
      },
      {
        url: '/organizations/liga-orbital/storage-usage/objects/object-1',
        method: 'DELETE',
      },
    ]);
  });

  it('calls the ruleset-override and stage-configuration editing endpoints (openspec 0169)', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = createControlApiClient({
      accessToken: () => 'token-admin',
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        return response({});
      },
    });
    if (
      !client.fetchRulesetOverrides ||
      !client.previewRulesetOverrides ||
      !client.updateRulesetOverrides ||
      !client.fetchStageConfiguration ||
      !client.previewStageConfiguration ||
      !client.updateStageConfiguration
    ) {
      throw new Error('openspec 0169 client methods must be available');
    }

    await client.fetchRulesetOverrides('liga-orbital', 'copa-verano');
    await client.previewRulesetOverrides('liga-orbital', 'copa-verano', {
      overrides: { 'scoring.pointsPerWin': 4 },
    });
    await client.updateRulesetOverrides('liga-orbital', 'copa-verano', {
      overrides: { 'scoring.pointsPerWin': 4 },
    });
    await client.fetchStageConfiguration('liga-orbital', 'copa-verano', 1);
    await client.previewStageConfiguration('liga-orbital', 'copa-verano', 1, {
      overrides: { 'segments.overtimeEnabled': true },
    });
    await client.updateStageConfiguration('liga-orbital', 'copa-verano', 1, {
      overrides: { 'segments.overtimeEnabled': true },
    });

    expect(calls).toEqual([
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/ruleset-overrides',
        method: 'GET',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/ruleset-overrides/preview',
        method: 'POST',
        body: { overrides: { 'scoring.pointsPerWin': 4 } },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/ruleset-overrides',
        method: 'PUT',
        body: { overrides: { 'scoring.pointsPerWin': 4 } },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/configuration',
        method: 'GET',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/configuration/preview',
        method: 'POST',
        body: { overrides: { 'segments.overtimeEnabled': true } },
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/stages/1/configuration',
        method: 'PUT',
        body: { overrides: { 'segments.overtimeEnabled': true } },
      },
    ]);
  });

  it('calls the invitation-rescission, identity-unlink and person/team removal endpoints (openspec 0170)', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = createControlApiClient({
      accessToken: () => 'token-admin',
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        return response({});
      },
    });
    if (
      !client.listPendingInvitations ||
      !client.rescindInvitation ||
      !client.linkParticipantIdentity ||
      !client.unlinkParticipantIdentity ||
      !client.removePerson ||
      !client.removeTeam
    ) {
      throw new Error('openspec 0170 client methods must be available');
    }

    await client.listPendingInvitations('liga-orbital');
    await client.rescindInvitation('liga-orbital', 'invite-1');
    await client.linkParticipantIdentity('liga-orbital', 'person-1', {
      email: 'person@example.test',
    });
    await client.unlinkParticipantIdentity('liga-orbital', 'person-1');
    await client.removePerson('liga-orbital', 'copa-verano', 'person-1');
    await client.removeTeam('liga-orbital', 'copa-verano', 'team-1');

    expect(calls).toEqual([
      {
        url: '/organizations/liga-orbital/invitations',
        method: 'GET',
      },
      {
        url: '/organizations/liga-orbital/invitations/invite-1',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/participants/person-1/identity-link',
        method: 'POST',
        body: { email: 'person@example.test' },
      },
      {
        url: '/organizations/liga-orbital/participants/person-1/identity-link',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/registrations/persons/person-1',
        method: 'DELETE',
      },
      {
        url: '/organizations/liga-orbital/tournaments/copa-verano/registrations/teams/team-1',
        method: 'DELETE',
      },
    ]);
  });
});
