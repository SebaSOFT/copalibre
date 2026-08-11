import {
  HEARTBEAT_COMMENT,
  REPLAY_EXPIRED_EVENT,
  SseParser,
  encodeEvent,
  encodeFrame,
  encodeHeartbeat,
  encodeReplayExpired,
} from './wire.js';

const envelope = {
  eventId: 'ev-1',
  organizationId: 'org-1',
  stream: 'match:m-1',
  entityId: 'm-1',
  eventType: 'match.finalized',
  projectionVersion: 1,
  createdAt: '2026-08-01T20:00:00.000Z',
  payload: { matchId: 'm-1' },
};

describe('encoding', () => {
  it('writes id, event and data, ending the frame with a blank line', () => {
    expect(encodeEvent(envelope)).toBe(
      `id: ev-1\nevent: match.finalized\ndata: ${JSON.stringify(envelope)}\n\n`,
    );
  });

  it('splits a multi-line payload across data lines', () => {
    // One line carrying a newline would end the frame early and truncate it.
    expect(encodeFrame({ data: 'one\ntwo' })).toBe('data: one\ndata: two\n\n');
  });

  it('writes a heartbeat as a comment, which the format defines as ignorable', () => {
    expect(encodeHeartbeat()).toBe(HEARTBEAT_COMMENT);
    expect(encodeHeartbeat().startsWith(':')).toBe(true);
  });

  it('names the replay-expired signal as an event, not an error', () => {
    const frame = encodeReplayExpired('cursor older than the window');

    expect(frame).toContain(`event: ${REPLAY_EXPIRED_EVENT}`);
    expect(frame).toContain('fetch-projection');
  });
});

describe('parsing', () => {
  it('reads back what the encoder wrote', () => {
    const [frame] = new SseParser().push(encodeEvent(envelope));

    expect(frame).toEqual({
      id: 'ev-1',
      event: 'match.finalized',
      data: JSON.stringify(envelope),
    });
  });

  it('holds a partial frame until the rest arrives', () => {
    // A ReadableStream chunk boundary lands wherever the network put it —
    // routinely mid-frame, and a parser that assumed otherwise would drop the
    // tail of every large payload.
    const parser = new SseParser();
    const encoded = encodeEvent(envelope);
    const split = Math.floor(encoded.length / 2);

    expect(parser.push(encoded.slice(0, split))).toEqual([]);
    expect(parser.pending().length).toBeGreaterThan(0);
    expect(parser.push(encoded.slice(split))).toHaveLength(1);
  });

  it('returns several frames from one chunk', () => {
    const parser = new SseParser();

    expect(
      parser.push(encodeEvent(envelope) + encodeEvent({ ...envelope, eventId: 'ev-2' })),
    ).toHaveLength(2);
  });

  it('drops heartbeats without reporting them as frames', () => {
    expect(new SseParser().push(`${HEARTBEAT_COMMENT}`)).toEqual([]);
  });

  it('survives a proxy that rewrote the line endings', () => {
    const parser = new SseParser();

    expect(parser.push('id: ev-1\r\ndata: {}\r\n\r\n')).toEqual([{ id: 'ev-1', data: '{}' }]);
  });

  it('rejoins a multi-line payload', () => {
    expect(new SseParser().push('data: one\ndata: two\n\n')[0]?.data).toBe('one\ntwo');
  });

  it('reads a retry hint as a number and ignores an unparsable one', () => {
    expect(new SseParser().push('retry: 5000\ndata: x\n\n')[0]?.retry).toBe(5000);
    expect(new SseParser().push('retry: soon\ndata: x\n\n')[0]?.retry).toBeUndefined();
  });

  it('ignores a field the protocol grew after this client shipped', () => {
    const [frame] = new SseParser().push('data: x\nfuture: whatever\n\n');

    expect(frame).toEqual({ data: 'x' });
  });

  it('tolerates a field with no colon and no value', () => {
    expect(new SseParser().push('data\n\n')).toEqual([{ data: '' }]);
  });

  it('forgets its buffer on reset, so a reconnect does not resume mid-frame', () => {
    const parser = new SseParser();
    parser.push('data: half');
    parser.reset();

    expect(parser.pending()).toBe('');
  });
});
