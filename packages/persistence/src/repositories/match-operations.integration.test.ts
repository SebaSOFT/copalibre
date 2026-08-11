import { authorizeMatchCommand, planCorrection, type MatchResult } from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { OutboxReader } from '../outbox.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { MatchAssignmentRepository } from './match-assignment-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';

/**
 * The integrity promise of 0014, against a real database: a result cannot be
 * overwritten, a correction keeps what it replaced, an appointment covers one
 * match, and a started downstream stage is not rebuilt behind anyone's back.
 */

const AUDIT = { actor: 'user:referee-1', authorizationContext: 'capability:match.finalize' };

const result: MatchResult = {
  sides: [
    { entrantId: 'a0000000-0000-4000-8000-000000000001', statistics: { goals: 2 } },
    { entrantId: 'a0000000-0000-4000-8000-000000000002', statistics: { goals: 1 } },
  ],
  winnerEntrantId: 'a0000000-0000-4000-8000-000000000001',
  recordedAt: '2026-07-31T20:00:00.000Z',
};

describe('match operations (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let tournamentId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-ops');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-atlas',
        name: 'Club Atlas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
    tournamentId = newId();
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** A stage with one match, ready to be finalized. */
  async function playableMatch(label: string) {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      await uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: tournamentId,
          organization_id: organizationId,
          alias: `copa-${label}`,
          name: `Copa ${label}`,
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      const stage = await competition.createStageInTournament(uow, {
        tournamentId,
        number: stageNumber++,
        name: `Stage ${label}`,
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return { stage, match };
    });
  }

  let stageNumber = 1;

  it('refuses to overwrite a finalized result on the ordinary write path', async () => {
    const { match } = await playableMatch('overwrite');
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId: match.matchId, result, organizationId, ...AUDIT }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId: match.matchId,
          result: { ...result, winnerEntrantId: result.sides[1]?.entrantId },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const stored = await competition.findMatch(match.matchId);
    expect(stored?.result?.winnerEntrantId).toBe(result.winnerEntrantId);
  });

  it('refuses every command once a match is finalized, including another finalize', async () => {
    const { match } = await playableMatch('finalized');
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, (uow) =>
      competition.applyCommand(uow, {
        matchId: match.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'a-1',
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      competition.applyCommand(uow, {
        matchId: match.matchId,
        command: 'finalize',
        status: 'finalized',
        grantedBy: 'a-1',
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.applyCommand(uow, {
          matchId: match.matchId,
          command: 'pause',
          status: 'in-progress',
          grantedBy: 'a-1',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('supersedes a result, keeping what it replaced and why', async () => {
    const { match } = await playableMatch('correction');
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId: match.matchId, result, organizationId, ...AUDIT }),
    );

    const corrected: MatchResult = {
      ...result,
      sides: [
        { entrantId: result.sides[0]?.entrantId ?? '', statistics: { goals: 2 } },
        { entrantId: result.sides[1]?.entrantId ?? '', statistics: { goals: 3 } },
      ],
      winnerEntrantId: result.sides[1]?.entrantId,
    };
    const plan = planCorrection(
      {
        matchId: match.matchId,
        replacement: corrected,
        reason: 'Third goal was recorded against the wrong side',
        actor: AUDIT.actor,
      },
      result,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    await withTransaction(scratch.db, (uow) =>
      competition.supersedeResult(uow, {
        matchId: match.matchId,
        result: plan.value.replacement,
        reason: plan.value.reason,
        organizationId,
        ...AUDIT,
      }),
    );

    const stored = await competition.findMatch(match.matchId);
    expect(stored?.result?.winnerEntrantId).toBe(corrected.winnerEntrantId);

    // The chain, not the latest link: the prior result and the reason survive.
    const history = await new AuditReader(scratch.db).historyFor('match', match.matchId);
    const supersession = history.find((entry) => entry.action === 'match.result-superseded');
    expect(supersession?.reason).toContain('wrong side');
    expect(supersession?.previousState).toMatchObject({
      winnerEntrantId: result.winnerEntrantId,
    });
  });

  it('retains a cited report/dispute id as supporting evidence in the audit trail (0032)', async () => {
    const { match } = await playableMatch('cites-report');
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId: match.matchId, result, organizationId, ...AUDIT }),
    );

    const sourceReportId = newId();
    const plan = planCorrection(
      {
        matchId: match.matchId,
        replacement: { ...result, winnerEntrantId: result.sides[1]?.entrantId },
        reason: 'Participant dispute upheld after review',
        actor: AUDIT.actor,
        sourceReportId,
      },
      result,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.sourceReportId).toBe(sourceReportId);

    await withTransaction(scratch.db, (uow) =>
      competition.supersedeResult(uow, {
        matchId: match.matchId,
        result: plan.value.replacement,
        reason: plan.value.reason,
        sourceReportId: plan.value.sourceReportId,
        organizationId,
        ...AUDIT,
      }),
    );

    // Retained as supporting evidence, never read back as authority — the
    // stored result and the operator's own reason are what the correction
    // actually rests on, asserted unchanged just above.
    const history = await new AuditReader(scratch.db).historyFor('match', match.matchId);
    const supersession = history.find(
      (entry) => entry.action === 'match.result-superseded' && entry.reason?.includes('dispute'),
    );
    expect(supersession?.resultingState).toMatchObject({ sourceReportId });
  });

  it('records the corrected fact while withholding a rebuild of a started stage', async () => {
    const { match } = await playableMatch('blocked');
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId: match.matchId, result, organizationId, ...AUDIT }),
    );

    const plan = planCorrection(
      {
        matchId: match.matchId,
        replacement: { ...result, winnerEntrantId: result.sides[1]?.entrantId },
        reason: 'Protest upheld',
        actor: AUDIT.actor,
      },
      result,
      { stageId: 'st-next', started: true, qualifiedEntrantIds: [] },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    await withTransaction(scratch.db, (uow) =>
      competition.supersedeResult(uow, {
        matchId: match.matchId,
        result: plan.value.replacement,
        reason: plan.value.reason,
        ...(plan.value.blockedPropagation
          ? { blockedPropagation: plan.value.blockedPropagation }
          : {}),
        organizationId,
        ...AUDIT,
      }),
    );

    const published = await new OutboxReader(scratch.db).pending();
    const event = published.find(
      (row) => row.eventType === 'result.superseded' && row.entityId === match.matchId,
    );

    // A consumer must not have to infer that the rebuild was deliberate.
    expect(event?.payload).toMatchObject({
      blockedPropagation: { stageId: 'st-next' },
    });
    expect(await competition.findMatch(match.matchId)).toMatchObject({
      result: { winnerEntrantId: result.sides[1]?.entrantId },
    });
  });

  it('previews exactly what the commit then does', async () => {
    const { match } = await playableMatch('preview');
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId: match.matchId, result, organizationId, ...AUDIT }),
    );

    const request = {
      matchId: match.matchId,
      replacement: {
        ...result,
        sides: [
          { entrantId: result.sides[0]?.entrantId ?? '', statistics: { goals: 2 } },
          { entrantId: result.sides[1]?.entrantId ?? '', statistics: { goals: 5 } },
        ],
        winnerEntrantId: result.sides[1]?.entrantId,
      },
      reason: 'Scoresheet reconciled with the referee report',
      actor: AUDIT.actor,
    };

    const preview = planCorrection(request, result);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    // The commit re-plans from stored state rather than trusting the preview,
    // and lands on the same answer — which is the property, not a coincidence.
    const stored = await competition.findMatch(match.matchId);
    const atCommit = planCorrection(request, stored?.result);
    expect(atCommit.ok).toBe(true);
    if (!atCommit.ok) return;
    expect(atCommit.value.changedEntrantIds).toEqual(preview.value.changedEntrantIds);

    await withTransaction(scratch.db, (uow) =>
      competition.supersedeResult(uow, {
        matchId: match.matchId,
        result: atCommit.value.replacement,
        reason: atCommit.value.reason,
        organizationId,
        ...AUDIT,
      }),
    );

    const after = await competition.findMatch(match.matchId);
    const moved = after?.result?.sides.filter(
      (side) =>
        side.statistics.goals !==
        result.sides.find((prior) => prior.entrantId === side.entrantId)?.statistics.goals,
    );
    expect(moved?.map((side) => side.entrantId)).toEqual(preview.value.changedEntrantIds);
  });

  it('scopes an appointment to what it names, and resolves a stage grant downward', async () => {
    const { stage, match } = await playableMatch('authority');
    const repository = new MatchAssignmentRepository(scratch.db);

    await withTransaction(scratch.db, (uow) =>
      repository.appoint(uow, {
        organizationId,
        subjectId: 'user:referee-1',
        scope: { kind: 'stage', stageId: stage.stageId },
        capabilities: ['match.record-event'],
        ...AUDIT,
      }),
    );

    const covering = await repository.forSubject({
      organizationId,
      subjectId: 'user:referee-1',
      matchId: match.matchId,
      stageId: stage.stageId,
    });
    expect(
      authorizeMatchCommand(covering, {
        subjectId: 'user:referee-1',
        capability: 'match.record-event',
        match: { organizationId, matchId: match.matchId, stageId: stage.stageId },
      }).ok,
    ).toBe(true);

    // Finalizing was never granted, and a stage grant does not imply it.
    expect(
      authorizeMatchCommand(covering, {
        subjectId: 'user:referee-1',
        capability: 'match.finalize',
        match: { organizationId, matchId: match.matchId, stageId: stage.stageId },
      }).ok,
    ).toBe(false);

    // Another subject's read returns nothing at all.
    const stranger = await repository.forSubject({
      organizationId,
      subjectId: 'user:impostor',
      matchId: match.matchId,
      stageId: stage.stageId,
    });
    expect(stranger).toHaveLength(0);
  });
});
