import {
  tagsAt,
  type EventDefinition,
  type RecordedEvent,
  type TagDeclaration,
} from '@copalibre/domain';
import type { ActorContext } from './fold.js';
import { tagFactsFrom } from './tags.js';

const CONTEXT = {
  matchId: 'm-1',
  stageId: 'st-1',
  seasonId: 'se-1',
  tournamentId: 't-1',
  organizationId: 'org-1',
};

const ATLAS: ActorContext = {
  personId: 'pe-1',
  playerId: 'pl-1',
  teamId: 'tm-atlas',
  clubId: 'cl-atlas',
};

const suspended: TagDeclaration = {
  code: 'suspended',
  label: 'Suspendido',
  appliesTo: ['person'],
};

const definitions = [
  {
    code: 'red-card',
    label: 'Tarjeta roja',
    category: 'negative',
    actorRequirement: 'person',
    payloadSchema: { type: 'object' },
    effects: [{ kind: 'tag', tagCode: 'suspended', action: 'applied' }],
  },
  {
    code: 'appeal-upheld',
    label: 'Apelación aceptada',
    category: 'neutral',
    actorRequirement: 'person',
    payloadSchema: { type: 'object' },
    effects: [{ kind: 'tag', tagCode: 'suspended', action: 'lifted' }],
  },
  {
    code: 'goal',
    label: 'Gol',
    category: 'positive',
    actorRequirement: 'optional',
    payloadSchema: { type: 'object' },
    effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
  },
] as unknown as readonly EventDefinition[];

function event(overrides: Partial<RecordedEvent> & { sequence: number }): RecordedEvent {
  return {
    eventId: `e-${overrides.sequence}`,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode: 'red-card',
    occurredAt: '2026-08-01T20:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

function facts(overrides: Partial<Parameters<typeof tagFactsFrom>[0]> = {}) {
  return tagFactsFrom({
    declarations: [suspended],
    events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
    definitions,
    actorOf: (entrantId) => (entrantId === 'en-atlas' ? ATLAS : undefined),
    context: CONTEXT,
    scope: 'season',
    ...overrides,
  });
}

describe('a discipline can label from a recorded event', () => {
  it('produces an application naming the person, the scope and the event behind it', () => {
    expect(facts()).toEqual([
      {
        code: 'suspended',
        action: 'applied',
        actorGranularity: 'person',
        actorId: 'pe-1',
        competitionGranularity: 'season',
        competitionId: 'se-1',
        actor: 'event:e-1',
        reason: 'Tarjeta roja',
        at: '2026-08-01T20:00:00.000Z',
      },
    ]);
  });

  it('produces a lifting the same way, so one history covers both', () => {
    const produced = facts({
      events: [
        event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' }),
        event({
          sequence: 2,
          definitionCode: 'appeal-upheld',
          side: 'en-atlas',
          personId: 'pe-1',
          occurredAt: '2026-08-08T20:00:00.000Z',
        }),
      ],
    });

    expect(produced).toHaveLength(2);
    // Read back, the two facts answer the question the tag exists for.
    expect(tagsAt([suspended], produced)).toEqual([]);
  });

  it('ignores an event declaring no tag effect', () => {
    expect(
      facts({ events: [event({ sequence: 1, definitionCode: 'goal', side: 'en-atlas' })] }),
    ).toEqual([]);
  });

  it('produces nothing for a tag the tournament did not declare', () => {
    // Otherwise a discipline could put a label on somebody that nothing defines.
    expect(facts({ declarations: [] })).toEqual([]);
  });

  it('labels at the granularity the declaration names', () => {
    const perTeam: TagDeclaration = { ...suspended, code: 'suspended', appliesTo: ['team'] };

    expect(facts({ declarations: [perTeam] })[0]).toMatchObject({
      actorGranularity: 'team',
      actorId: 'tm-atlas',
    });
  });

  it('produces nothing when the actor cannot be resolved at that granularity', () => {
    const perClub: TagDeclaration = { ...suspended, appliesTo: ['club'] };

    expect(
      facts({
        declarations: [perClub],
        events: [event({ sequence: 1, personId: 'pe-9' })],
      }),
    ).toEqual([]);
  });

  it('scopes to whatever competition granularity the tournament configured', () => {
    expect(facts({ scope: 'tournament' })[0]).toMatchObject({
      competitionGranularity: 'tournament',
      competitionId: 't-1',
    });
  });

  it("falls back to the discipline's declaration when the tournament configured none", () => {
    const seasonal: TagDeclaration = { ...suspended, producedAt: 'season' };

    expect(facts({ declarations: [seasonal], scope: undefined })[0]).toMatchObject({
      competitionGranularity: 'season',
      competitionId: 'se-1',
    });
  });

  it('lets the tournament overrule the discipline, because it is what this organizer configured', () => {
    const seasonal: TagDeclaration = { ...suspended, producedAt: 'season' };

    expect(facts({ declarations: [seasonal], scope: 'match' })[0]).toMatchObject({
      competitionGranularity: 'match',
      competitionId: 'm-1',
    });
  });

  it('produces nothing when neither side named a scope', () => {
    // Filing a suspension in a competition nobody named is worse than not
    // producing the fact: somebody would have to argue it out of the record.
    expect(facts({ scope: undefined })).toEqual([]);
  });
});
