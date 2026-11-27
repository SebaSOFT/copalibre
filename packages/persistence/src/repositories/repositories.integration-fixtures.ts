import { winConditionScript, type DisciplineDescriptor } from '@copalibre/domain';
import { newId } from '../ids.js';
import { createMigratedDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { TournamentRepository } from './tournament-repository.js';

export const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

export function descriptor(): DisciplineDescriptor {
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

export async function startRepositoriesFixture() {
  const scratch = await createMigratedDatabase('repos');
  const organizations = new OrganizationRepository(scratch.db);
  const tournaments = new TournamentRepository(scratch.db);
  const participants = new EnrollmentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);

  const organization = await withTransaction(scratch.db, (uow) =>
    organizations.create(uow, {
      alias: 'liga-orbital',
      name: 'Liga Orbital',
      ...AUDIT,
    }),
  );
  const organizationId = organization.organizationId;
  return { scratch, organizations, tournaments, participants, competition, organizationId };
}
