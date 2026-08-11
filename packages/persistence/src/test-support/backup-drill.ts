import { fixtureDescriptor } from '@copalibre/domain';
import { createDatabase, databaseConfigFromEnv } from '../database.js';
import { newId } from '../ids.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from '../repositories/competition-repository.js';
import { EnrollmentRepository } from '../repositories/enrollment-repository.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { PersonRepository } from '../repositories/person-repository.js';
import { TournamentRepository } from '../repositories/tournament-repository.js';

const ORGANIZATION_ALIAS = 'backup-drill';
const AUDIT = {
  actor: 'system:backup-drill',
  authorizationContext: 'maintenance:backup-restore-drill',
} as const;

async function seed(): Promise<void> {
  const db = createDatabase(databaseConfigFromEnv());
  try {
    const existing = await new OrganizationRepository(db).findByAlias(ORGANIZATION_ALIAS);
    if (existing) throw new Error(`Backup drill fixture ${ORGANIZATION_ALIAS} already exists`);

    const descriptor = fixtureDescriptor({
      descriptorId: newId(),
      alias: 'backup-drill-discipline',
      version: '1.0.0',
      statistics: [{ code: 'score', label: 'Score', aggregation: 'sum' }],
      scoringInputs: [],
    });

    await withTransaction(db, async (uow) => {
      const organization = await new OrganizationRepository(db).create(uow, {
        alias: ORGANIZATION_ALIAS,
        name: 'Backup Restore Drill',
        ...AUDIT,
      });
      const context = { organizationId: organization.organizationId, ...AUDIT };
      const tournaments = new TournamentRepository(db);
      await tournaments.saveDescriptor(uow, descriptor, context);
      const tournament = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: 'integrity-cup',
        name: 'Integrity Cup',
        descriptor,
        ...AUDIT,
      });

      const people = new PersonRepository(db);
      const first = await people.register(uow, {
        organizationId: organization.organizationId,
        alias: 'participant-one',
        displayName: 'Participant One',
        ...AUDIT,
      });
      const second = await people.register(uow, {
        organizationId: organization.organizationId,
        alias: 'participant-two',
        displayName: 'Participant Two',
        ...AUDIT,
      });
      const enrollment = new EnrollmentRepository(db);
      const firstEntrant = await enrollment.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: first.person.personId },
        ...context,
      });
      const secondEntrant = await enrollment.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: second.person.personId },
        ...context,
      });

      const competition = new CompetitionRepository(db);
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Main Stage',
        format: 'round-robin',
        ...context,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: firstEntrant.entrantId,
            awayEntrantId: secondEntrant.entrantId,
          },
        ],
        ...context,
      });
      if (!fixture) throw new Error('Backup drill fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        ...context,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: firstEntrant.entrantId, statistics: { score: 2 } },
            { entrantId: secondEntrant.entrantId, statistics: { score: 1 } },
          ],
          winnerEntrantId: firstEntrant.entrantId,
          recordedAt: '2026-01-01T12:00:00.000Z',
        },
        ...context,
      });
    });
  } finally {
    await db.destroy();
  }
}

async function snapshot(): Promise<void> {
  const db = createDatabase(databaseConfigFromEnv());
  try {
    const organization = await new OrganizationRepository(db).findByAlias(ORGANIZATION_ALIAS);
    if (!organization) throw new Error(`Backup drill fixture ${ORGANIZATION_ALIAS} is missing`);
    const organizationId = organization.organizationId;

    const tournaments = await db
      .selectFrom('tournaments')
      .select(['tournament_id', 'alias', 'name', 'descriptor_id', 'descriptor_version', 'status'])
      .where('organization_id', '=', organizationId)
      .orderBy('tournament_id')
      .execute();
    const participants = await db
      .selectFrom('persons')
      .select(['person_id', 'alias', 'display_name'])
      .where('organization_id', '=', organizationId)
      .orderBy('person_id')
      .execute();
    const results = await db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select(['matches.match_id', 'matches.status', 'matches.result'])
      .where('tournaments.organization_id', '=', organizationId)
      .where('matches.result', 'is not', null)
      .orderBy('matches.match_id')
      .execute();
    const audit = await db
      .selectFrom('audit_log')
      .select([
        'audit_id',
        'entity_type',
        'entity_id',
        'action',
        'actor',
        'authorization_context',
        'previous_state',
        'resulting_state',
        'reason',
      ])
      .where('organization_id', '=', organizationId)
      .orderBy('audit_id')
      .execute();

    if (
      tournaments.length === 0 ||
      participants.length === 0 ||
      results.length === 0 ||
      audit.length === 0
    ) {
      throw new Error('Backup drill fixture is incomplete');
    }
    process.stdout.write(`${JSON.stringify({ tournaments, participants, results, audit })}\n`);
  } finally {
    await db.destroy();
  }
}

const command = process.argv[2];
if (command === 'seed') await seed();
else if (command === 'snapshot') await snapshot();
else throw new Error('Usage: backup-drill <seed|snapshot>');
