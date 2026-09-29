import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { TournamentsController } from './tournaments.controller.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { TournamentRepository, CompetitionRepository } from '@copalibre/persistence';
import type { Tournament, TournamentCompletionSummary } from '@copalibre/domain';

describe('TournamentsController - completion', () => {
  let controller: TournamentsController;
  let mockDb: Kysely<Database>;
  let spyFindByScopedAlias: ReturnType<typeof jest.spyOn>;
  let spyGetTournamentCompletion: ReturnType<typeof jest.spyOn>;

  const publishedTournament = {
    tournamentId: '01936f4a-0001-7000-8000-000000000001',
    organizationId: '01936f4a-0000-7000-8000-000000000001',
    alias: 'copa-test',
    status: 'published' as const,
  };

  const draftTournament = {
    tournamentId: '01936f4a-0001-7000-8000-000000000002',
    organizationId: '01936f4a-0000-7000-8000-000000000001',
    alias: 'draft-cup',
    status: 'draft' as const,
  };

  const sampleCompletion: TournamentCompletionSummary = {
    totalMatches: 10,
    resolvedMatches: 6,
    liveMatches: 1,
    scheduledMatches: 3,
    finalizedMatches: 5,
    forfeitedMatches: 1,
    stages: [
      {
        stageId: '01936f4a-0002-7000-8000-000000000001',
        stageNumber: 1,
        stageName: 'Group Stage',
        totalMatches: 6,
        resolvedMatches: 6,
        liveMatches: 0,
        scheduledMatches: 0,
        finalizedMatches: 5,
        forfeitedMatches: 1,
      },
      {
        stageId: '01936f4a-0002-7000-8000-000000000002',
        stageNumber: 2,
        stageName: 'Playoffs',
        totalMatches: 4,
        resolvedMatches: 0,
        liveMatches: 1,
        scheduledMatches: 3,
        finalizedMatches: 0,
        forfeitedMatches: 0,
      },
    ],
  };

  beforeEach(() => {
    spyFindByScopedAlias = jest.spyOn(TournamentRepository.prototype, 'findByScopedAlias');
    spyGetTournamentCompletion = jest.spyOn(
      CompetitionRepository.prototype,
      'getTournamentCompletion',
    );

    mockDb = {} as unknown as Kysely<Database>;
    controller = new TournamentsController(mockDb);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NotFoundException when tournament does not exist', async () => {
    spyFindByScopedAlias.mockResolvedValue(undefined);
    const request: RequestWithSubject = { headers: {} };

    await expect(controller.completion('org-alias', 'missing-cup', request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when tournament is draft and request is anonymous', async () => {
    spyFindByScopedAlias.mockResolvedValue(draftTournament as unknown as Tournament);
    const request: RequestWithSubject = { headers: {} };

    await expect(controller.completion('org-alias', 'draft-cup', request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when tournament is draft and caller is from a different organization', async () => {
    spyFindByScopedAlias.mockResolvedValue(draftTournament as unknown as Tournament);
    const request: RequestWithSubject = {
      headers: {},
      subject: {
        subjectId: 'user-2',
        organizationId: 'other-org-id',
        scopes: ['copalibre.control'],
      },
    };

    await expect(controller.completion('org-alias', 'draft-cup', request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns completion summary when tournament is draft and caller is authorized organizer', async () => {
    spyFindByScopedAlias.mockResolvedValue(draftTournament as unknown as Tournament);
    spyGetTournamentCompletion.mockResolvedValue(sampleCompletion);

    const request: RequestWithSubject = {
      headers: {},
      subject: {
        subjectId: 'user-1',
        organizationId: draftTournament.organizationId,
        scopes: ['copalibre.control'],
      },
    };

    const result = await controller.completion('org-alias', 'draft-cup', request);
    expect(result).toEqual(sampleCompletion);
    expect(spyGetTournamentCompletion).toHaveBeenCalledWith(draftTournament.tournamentId);
  });

  it('returns completion summary for anonymous public request when tournament is published', async () => {
    spyFindByScopedAlias.mockResolvedValue(publishedTournament as unknown as Tournament);
    spyGetTournamentCompletion.mockResolvedValue(sampleCompletion);

    const request: RequestWithSubject = { headers: {} };

    const result = await controller.completion('org-alias', 'copa-test', request);
    expect(result).toEqual(sampleCompletion);
    expect(result.totalMatches).toBe(10);
    expect(result.resolvedMatches).toBe(6);
    expect(result.stages).toHaveLength(2);
    expect(spyGetTournamentCompletion).toHaveBeenCalledWith(publishedTournament.tournamentId);
  });

  it('returns completion summary for authorized organizer when tournament is published', async () => {
    spyFindByScopedAlias.mockResolvedValue(publishedTournament as unknown as Tournament);
    spyGetTournamentCompletion.mockResolvedValue(sampleCompletion);

    const request: RequestWithSubject = {
      headers: {},
      subject: {
        subjectId: 'user-1',
        organizationId: publishedTournament.organizationId,
        scopes: ['copalibre.control'],
      },
    };

    const result = await controller.completion('org-alias', 'copa-test', request);
    expect(result).toEqual(sampleCompletion);
  });
});
