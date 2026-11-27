import type {
  ConsoleEventDefinition,
  ConsoleSegment,
  MatchConsoleResponse,
} from '../../lib/api-client.js';
import type { QueuedMutation } from '../../lib/offline-queue.js';
import { ORG, TOURNAMENT, consoleProjection, ids } from '../screen-story-fixtures.js';
import {
  matchConsoleBreadcrumbsOf,
  matchConsoleLoadDataHrefOf,
  queuedEventsOf,
  secondaryActorFieldsOf,
  segmentIdOf,
  variantOf,
} from './match-console-model.js';

const scheduled: MatchConsoleResponse = {
  ...consoleProjection,
  status: 'scheduled',
  segments: [],
  events: [],
};

function nameOf(entrantId: string): string | undefined {
  return consoleProjection.entrants.find((entrant) => entrant.entrantId === entrantId)?.name;
}

describe('matchConsoleBreadcrumbsOf', () => {
  const home = nameOf(ids.first);
  const away = nameOf(ids.second);
  const matchName = home && away ? `${home} vs ${away}` : undefined;
  const tournamentHref = `/control/${ORG}/tournaments/${TOURNAMENT}`;

  it('links the tournament and names the match when both sides are named', () => {
    expect(
      matchConsoleBreadcrumbsOf({
        organizationAlias: ORG,
        projection: { ...consoleProjection, homeEntrantId: ids.first, awayEntrantId: ids.second },
        tournamentAlias: TOURNAMENT,
        tournamentName: 'Apertura 2026',
        tournamentNameLoading: false,
      }),
    ).toEqual([
      { label: 'Apertura 2026', href: tournamentHref },
      { label: matchName, current: true },
    ]);
  });

  it('shows a loading tournament crumb while the name is still loading', () => {
    expect(
      matchConsoleBreadcrumbsOf({
        organizationAlias: ORG,
        projection: { ...consoleProjection, homeEntrantId: ids.first, awayEntrantId: ids.second },
        tournamentAlias: TOURNAMENT,
        tournamentName: null,
        tournamentNameLoading: true,
      }),
    ).toEqual([
      { label: '', loading: true },
      { label: matchName, current: true },
    ]);
  });

  it('omits the tournament crumb when the name is absent and not loading', () => {
    expect(
      matchConsoleBreadcrumbsOf({
        organizationAlias: ORG,
        projection: { ...consoleProjection, homeEntrantId: ids.first, awayEntrantId: ids.second },
        tournamentAlias: TOURNAMENT,
        tournamentName: undefined,
        tournamentNameLoading: false,
      }),
    ).toEqual([{ label: matchName, current: true }]);
  });

  it('omits the match crumb until both sides are named', () => {
    expect(
      matchConsoleBreadcrumbsOf({
        organizationAlias: ORG,
        projection: { ...consoleProjection, homeEntrantId: ids.first, awayEntrantId: 'unknown' },
        tournamentAlias: TOURNAMENT,
        tournamentName: 'Apertura 2026',
        tournamentNameLoading: false,
      }),
    ).toEqual([{ label: 'Apertura 2026', href: tournamentHref }]);
  });
});

describe('matchConsoleLoadDataHrefOf', () => {
  const args = {
    matchId: ids.match,
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
  };
  const loadHref = `/control/${ORG}/tournaments/${TOURNAMENT}/matches/${ids.match}/load`;

  it('offers the load for a scheduled match with no segments and no events', () => {
    expect(matchConsoleLoadDataHrefOf({ ...args, projection: scheduled })).toBe(loadHref);
  });

  it('withholds the load once the match is in progress', () => {
    expect(
      matchConsoleLoadDataHrefOf({
        ...args,
        projection: { ...scheduled, status: 'in-progress' },
      }),
    ).toBeUndefined();
  });

  it('withholds the load when the match already has a segment', () => {
    expect(
      matchConsoleLoadDataHrefOf({
        ...args,
        projection: { ...scheduled, segments: consoleProjection.segments },
      }),
    ).toBeUndefined();
  });

  it('withholds the load when the match already has an event', () => {
    expect(
      matchConsoleLoadDataHrefOf({
        ...args,
        projection: { ...scheduled, events: consoleProjection.events },
      }),
    ).toBeUndefined();
  });
});

describe('queuedEventsOf', () => {
  const projectedEvent = consoleProjection.events[0];
  if (!projectedEvent) throw new Error('fixture has no projected event');
  const segmentId = consoleProjection.segments[0]?.segmentId ?? ids.stage;

  function recordMutation(
    id: string,
    request: { definitionCode: string; segmentId: string; occurredAt: number; personId?: string },
  ): QueuedMutation {
    return {
      id,
      matchId: ids.match,
      idempotencyKey: id,
      attemptedAt: 0,
      status: 'pending',
      action: {
        kind: 'record-event',
        organizationAlias: ORG,
        tournamentAlias: TOURNAMENT,
        matchId: ids.match,
        request: request as never,
      },
    };
  }

  it('shapes a pending record-event as a projected event numbered after the projection', () => {
    const occurredAt = Date.parse('2026-11-27T10:00:00.000Z');
    const [queued] = queuedEventsOf(consoleProjection, [
      recordMutation('m-1', {
        definitionCode: 'card',
        segmentId,
        occurredAt,
        personId: ids.person,
      }),
    ]);
    expect(queued).toMatchObject({
      eventId: 'queued-m-1',
      definitionCode: 'card',
      segmentId,
      sequence: consoleProjection.events.length + 1,
      occurredAt: '2026-11-27T10:00:00.000Z',
      personId: ids.person,
    });
  });

  it('skips a queued event whose sync key the projection already holds', () => {
    expect(
      queuedEventsOf(consoleProjection, [
        recordMutation('m-dup', {
          definitionCode: projectedEvent.definitionCode,
          segmentId: projectedEvent.segmentId,
          occurredAt: Date.parse(projectedEvent.occurredAt),
        }),
      ]),
    ).toEqual([]);
  });

  it('skips a queued action that is not a record-event', () => {
    const clockCommand: QueuedMutation = {
      id: 'm-clock',
      matchId: ids.match,
      idempotencyKey: 'm-clock',
      attemptedAt: 0,
      status: 'pending',
      action: {
        kind: 'clock-command',
        organizationAlias: ORG,
        tournamentAlias: TOURNAMENT,
        matchId: ids.match,
        request: {} as never,
      } as unknown as QueuedMutation['action'],
    };
    expect(queuedEventsOf(consoleProjection, [clockCommand])).toEqual([]);
  });
});

describe('secondaryActorFieldsOf', () => {
  function definition(
    code: string,
    fields: { field: string; label: string }[],
  ): ConsoleEventDefinition {
    return {
      ...consoleProjection.eventDefinitions[0],
      code,
      secondaryActorFields: fields.map(({ field, label }) => ({
        field,
        label: {
          en: label,
          es: label,
          de: label,
          fr: label,
          pt: label,
          it: label,
          ru: label,
          zh: label,
        },
      })),
    } as ConsoleEventDefinition;
  }

  it('keeps one entry per field name, labelled by its first declaration', () => {
    const result = secondaryActorFieldsOf([
      definition('goal', [{ field: 'assistedBy', label: 'Assist' }]),
      definition('foul', [
        { field: 'assistedBy', label: 'Other label' },
        { field: 'fouledBy', label: 'Fouled' },
      ]),
    ]);
    expect(result.map((entry) => entry.field)).toEqual(['assistedBy', 'fouledBy']);
    expect(result[0]?.label).toEqual(expect.objectContaining({ en: 'Assist' }));
  });

  it('returns nothing when no permitted event declares a secondary field', () => {
    expect(secondaryActorFieldsOf([definition('goal', [])])).toEqual([]);
  });
});

describe('segmentIdOf and variantOf', () => {
  it('reads an absent segment as an empty id', () => {
    expect(segmentIdOf(undefined)).toBe('');
    expect(segmentIdOf(consoleProjection.segments[0] as ConsoleSegment)).toBe(ids.stage);
  });

  it('maps the primary flag to the button variant', () => {
    expect(variantOf(true)).toBe('primary');
    expect(variantOf(false)).toBe('secondary');
  });
});
