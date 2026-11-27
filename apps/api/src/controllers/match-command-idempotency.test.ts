import { answerFromKey, type KeyedCommand } from './match-command-idempotency.js';

const MATCH = 'match-1';
const OTHER_MATCH = 'match-2';

function stored(overrides: Partial<KeyedCommand<Readonly<Record<string, unknown>>>> = {}) {
  return {
    matchId: MATCH,
    operation: 'end',
    requestFingerprint: 'fp-a',
    response: { status: 'completed' },
    responsePending: false,
    ...overrides,
  } satisfies KeyedCommand<Readonly<Record<string, unknown>>>;
}

describe('answerFromKey', () => {
  it('reports a conflict when the operation differs', () => {
    expect(answerFromKey(stored(), MATCH, 'start', 'fp-a')).toEqual({ outcome: 'conflict' });
  });

  it('reports a conflict when the match differs', () => {
    expect(answerFromKey(stored(), OTHER_MATCH, 'end', 'fp-a')).toEqual({ outcome: 'conflict' });
  });

  it('reports a conflict when the fingerprint differs', () => {
    expect(answerFromKey(stored(), MATCH, 'end', 'fp-b')).toEqual({ outcome: 'conflict' });
  });

  it('replays a completed row with its response', () => {
    expect(answerFromKey(stored(), MATCH, 'end', 'fp-a')).toEqual({
      outcome: 'replay',
      response: { status: 'completed' },
    });
  });

  it('asks for the response to be read when the row is pending', () => {
    expect(
      answerFromKey(stored({ responsePending: true, response: {} }), MATCH, 'end', 'fp-a'),
    ).toEqual({ outcome: 'respond' });
  });

  it('refuses a pending row whose fingerprint differs, without reading the response', () => {
    expect(
      answerFromKey(stored({ responsePending: true, response: {} }), MATCH, 'end', 'fp-b'),
    ).toEqual({ outcome: 'conflict' });
  });
});
