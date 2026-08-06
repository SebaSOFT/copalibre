import { winConditionScript, type DisciplineDescriptor } from '@copalibre/domain';
import {
  AuditReader,
  DisplayTokenRepository,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
} from '../index.js';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

function descriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `orbital-field-${descriptorId}`,
    version: '1.0.0',
    name: 'Orbital Field',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 9 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [
      {
        code: 'strike',
        label: 'Strike',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: {} },
        effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
      },
    ],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'score' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      'identityRules.federationCode': {
        permission: { kind: 'forbidden' },
        mutationClass: 'safe',
      },
    },
  };
}

describe('display-token issuance and revocation (integration, 0031)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let tournamentId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('display-tokens');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-tv',
        name: 'Liga TV',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;

    const tournament = await withTransaction(scratch.db, (uow) =>
      new TournamentRepository(scratch.db).create(uow, {
        organizationId,
        alias: 'apertura-2026',
        name: 'Apertura 2026',
        descriptor: descriptor(),
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    tournamentId = tournament.tournamentId;
  });

  afterAll(async () => scratch.drop());

  it('binds a token to the issuing scope and rejects it once revoked', async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-1',
        label: 'Cancha principal',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    expect(issued).toMatchObject({
      organizationId,
      tournamentId,
      label: 'Cancha principal',
      revoked: false,
    });
    await expect(tokens.scopeOf('hash-kiosk-1')).resolves.toMatchObject({
      displayTokenId: issued.displayTokenId,
      organizationId,
      tournamentId,
    });

    await withTransaction(scratch.db, (uow) =>
      tokens.revoke(uow, {
        displayTokenId: issued.displayTokenId,
        organizationId,
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    // A revoked token authorizes nothing: scopeOf only ever reads unrevoked
    // rows, which is the entire enforcement point for the SSE guard.
    await expect(tokens.scopeOf('hash-kiosk-1')).resolves.toBeUndefined();
  });

  it("revoking one device's token leaves every other device's token untouched", async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    const deviceA = await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-a',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-b',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      tokens.revoke(uow, {
        displayTokenId: deviceA.displayTokenId,
        organizationId,
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    await expect(tokens.scopeOf('hash-kiosk-a')).resolves.toBeUndefined();
    await expect(tokens.scopeOf('hash-kiosk-b')).resolves.toMatchObject({
      organizationId,
      tournamentId,
    });
  });

  it('returns nothing for a hash that was never issued', async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    await expect(tokens.scopeOf('hash-never-issued')).resolves.toBeUndefined();
  });

  it('rejects revoking a token that belongs to a different organization', async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    const otherOrganization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'otra-liga',
        name: 'Otra Liga',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-cross-org',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        tokens.revoke(uow, {
          displayTokenId: issued.displayTokenId,
          organizationId: otherOrganization.organizationId,
          actor: 'user:intruder',
          authorizationContext: 'copalibre.control',
        }),
      ),
    ).rejects.toThrow('Display token was not found');

    // Unaffected by the rejected cross-organization attempt.
    await expect(tokens.scopeOf('hash-kiosk-cross-org')).resolves.toMatchObject({
      displayTokenId: issued.displayTokenId,
    });
  });

  it('records issuance and revocation in the audit trail', async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-audit',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      tokens.revoke(uow, {
        displayTokenId: issued.displayTokenId,
        organizationId,
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    const audit = await new AuditReader(scratch.db).historyFor(
      'display-token',
      issued.displayTokenId,
    );
    expect(audit.map((entry) => entry.action)).toEqual([
      'display-token.issued',
      'display-token.revoked',
    ]);
  });

  it('updates the last-seen heartbeat without gating authorization', async () => {
    const tokens = new DisplayTokenRepository(scratch.db);
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.issue(uow, {
        organizationId,
        tournamentId,
        tokenHash: 'hash-kiosk-heartbeat',
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );
    expect(issued.lastSeenAt).toBeUndefined();

    await tokens.touchLastSeen(issued.displayTokenId);

    const listed = await tokens.listByOrganization(organizationId);
    const found = listed.find((token) => token.displayTokenId === issued.displayTokenId);
    expect(found?.lastSeenAt).toEqual(expect.any(String));
  });
});
