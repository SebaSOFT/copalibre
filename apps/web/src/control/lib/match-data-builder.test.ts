import {
  buildBulkLoadRequest,
  buildMatchDataCsv,
  matchDataCsvTemplate,
  parseMatchDataCsv,
  MATCH_DATA_CSV_COLUMNS,
  type RosterDraft,
} from './match-data-builder.js';
import type { RosterCandidate } from './api-client.js';

const ENTRANT_HOME = '00000000-0000-7000-8000-000000000001';
const ENTRANT_AWAY = '00000000-0000-7000-8000-000000000002';
const PLAYER_ONE = '00000000-0000-7000-8000-0000000000a1';
const PLAYER_TWO = '00000000-0000-7000-8000-0000000000a2';

const CANDIDATES: ReadonlyMap<string, readonly RosterCandidate[]> = new Map([
  [ENTRANT_HOME, [{ personId: PLAYER_ONE, name: 'Ada Lovelace' }]],
  [ENTRANT_AWAY, [{ personId: PLAYER_TWO, name: 'Grace Hopper' }]],
]);

const csv = buildMatchDataCsv;

describe('buildBulkLoadRequest', () => {
  it('builds the exact structured submission from drafts, dropping empty rosters', () => {
    const roster: RosterDraft = {
      entrantId: ENTRANT_HOME,
      members: [{ personId: PLAYER_ONE, onField: true, number: '10' }],
    };
    const empty: RosterDraft = { entrantId: ENTRANT_AWAY, members: [] };

    const request = buildBulkLoadRequest({
      rosters: [roster, empty],
      segments: [{ type: 'half', elapsedSeconds: 2700 }, { type: 'half' }],
      events: [
        {
          definitionCode: 'goal',
          segmentNumber: 1,
          occurredAt: 1_700_000_000_000,
          side: ENTRANT_HOME,
          personId: PLAYER_ONE,
          notes: 'header',
        },
      ],
      entrantIds: [ENTRANT_HOME, ENTRANT_AWAY],
      winnerEntrantId: ENTRANT_HOME,
    });

    expect(request.rosters).toEqual([roster]);
    expect(request.segments).toEqual([{ type: 'half', elapsedSeconds: 2700 }, { type: 'half' }]);
    expect(request.events).toEqual([
      {
        definitionCode: 'goal',
        segmentNumber: 1,
        occurredAt: 1_700_000_000_000,
        side: ENTRANT_HOME,
        personId: PLAYER_ONE,
        notes: 'header',
      },
    ]);
    expect(request.result).toEqual({
      sides: [
        { entrantId: ENTRANT_HOME, statistics: {} },
        { entrantId: ENTRANT_AWAY, statistics: {} },
      ],
      winnerEntrantId: ENTRANT_HOME,
    });
  });

  it('omits winnerEntrantId when none was chosen, matching a draw submission', () => {
    const request = buildBulkLoadRequest({
      rosters: [],
      segments: [],
      events: [],
      entrantIds: [ENTRANT_HOME, ENTRANT_AWAY],
    });

    expect(request.result.winnerEntrantId).toBeUndefined();
  });
});

describe('parseMatchDataCsv', () => {
  it('parses a well-formed file into the identical structured submission the manual builder produces', () => {
    const file = csv([
      {
        type: 'roster',
        entrantId: ENTRANT_HOME,
        personName: 'Ada Lovelace',
        number: '10',
        onField: 'true',
      },
      { type: 'segment', segmentType: 'half', elapsedSeconds: '2700' },
      {
        type: 'event',
        definitionCode: 'goal',
        segmentNumber: '1',
        occurredAt: '2025-03-15T15:32:00Z',
        side: ENTRANT_HOME,
      },
      { type: 'result', winnerEntrantId: ENTRANT_HOME },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rosters).toEqual([
      { entrantId: ENTRANT_HOME, members: [{ personId: PLAYER_ONE, onField: true, number: '10' }] },
    ]);
    expect(result.value.segments).toEqual([{ type: 'half', elapsedSeconds: 2700 }]);
    expect(result.value.events).toEqual([
      {
        definitionCode: 'goal',
        segmentNumber: 1,
        occurredAt: new Date('2025-03-15T15:32:00Z').getTime(),
        side: ENTRANT_HOME,
      },
    ]);
    expect(result.value.winnerEntrantId).toBe(ENTRANT_HOME);
  });

  it('resolves an event row personName against the named side entrant candidates', () => {
    const file = csv([
      { type: 'segment', segmentType: 'half', elapsedSeconds: '2700' },
      {
        type: 'event',
        definitionCode: 'goal',
        segmentNumber: '1',
        occurredAt: '2025-03-15T15:32:00Z',
        side: ENTRANT_AWAY,
        personName: 'Grace Hopper',
      },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events[0]?.personId).toBe(PLAYER_TWO);
  });

  it('reports every malformed row at once, not just the first', () => {
    const file = csv([
      { type: 'roster', entrantId: ENTRANT_HOME, personName: 'Unknown Person' },
      { type: 'segment' },
      { type: 'event', segmentNumber: 'not-a-number', occurredAt: 'not-a-date' },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors.some((error) => error.message.includes('Unknown Person'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('segmentType'))).toBe(true);
  });

  it('refuses a well-formed-per-row file whose event names a segment that was never provided', () => {
    const file = csv([
      {
        type: 'event',
        definitionCode: 'goal',
        segmentNumber: '3',
        occurredAt: '2025-03-15T15:32:00Z',
      },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('only 0 segment row(s)');
  });

  it('surfaces a genuine parse error from a structurally broken file', () => {
    const malformed = `${MATCH_DATA_CSV_COLUMNS.join(',')}\nroster,too,few`;

    const result = parseMatchDataCsv(malformed, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('refuses an ambiguous personName that matches more than one candidate', () => {
    const ambiguous: ReadonlyMap<string, readonly RosterCandidate[]> = new Map([
      [
        ENTRANT_HOME,
        [
          { personId: PLAYER_ONE, name: 'Same Name' },
          { personId: PLAYER_TWO, name: 'Same Name' },
        ],
      ],
    ]);
    const file = csv([{ type: 'roster', entrantId: ENTRANT_HOME, personName: 'Same Name' }]);

    const result = parseMatchDataCsv(file, ambiguous);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('matches more than one');
  });

  it('refuses a roster row missing entrantId or personName', () => {
    const file = csv([{ type: 'roster', personName: 'Ada Lovelace' }]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('needs entrantId and personName');
  });

  it('reads semicolon-separated roles off a roster row', () => {
    const file = csv([
      {
        type: 'roster',
        entrantId: ENTRANT_HOME,
        personName: 'Ada Lovelace',
        roles: 'captain; vice-captain',
      },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rosters[0]?.members[0]?.roles).toEqual(['captain', 'vice-captain']);
  });

  it('refuses an event row with a non-positive or non-integer segment number', () => {
    const file = csv([
      {
        type: 'event',
        definitionCode: 'goal',
        segmentNumber: '0',
        occurredAt: '2025-03-15T15:32:00Z',
      },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('is not a valid segment number');
  });

  it('refuses an event row with an unparsable occurredAt', () => {
    const file = csv([
      { type: 'event', definitionCode: 'goal', segmentNumber: '1', occurredAt: 'not-a-real-date' },
    ]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('is not a valid date/time');
  });

  it('refuses an unrecognized row type', () => {
    const file = csv([{ type: 'not-a-real-type' }]);

    const result = parseMatchDataCsv(file, CANDIDATES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('Unknown row type');
  });
});

describe('matchDataCsvTemplate', () => {
  it('matches the documented column shape parseMatchDataCsv reads', () => {
    const template = matchDataCsvTemplate();
    const header = template.split('\n')[0];

    expect(header).toBe(MATCH_DATA_CSV_COLUMNS.join(','));

    const result = parseMatchDataCsv(template, CANDIDATES);
    // The template's placeholder entrant/name values won't resolve against
    // real candidates — the point of this test is that the template's own
    // shape parses cleanly into per-row type recognition, not that its
    // placeholders match anyone real.
    expect(
      result.ok ||
        result.errors.every(
          (error) =>
            error.message.includes('No registered') || error.message.includes('Unknown entrant'),
        ),
    ).toBe(true);
  });
});
