import { heartbeatStatus } from './device-heartbeat.js';

const NOW = Date.parse('2026-08-06T12:00:00.000Z');

describe('heartbeatStatus', () => {
  it('is revoked regardless of how recently it was seen', () => {
    expect(heartbeatStatus({ revoked: true, lastSeenAt: '2026-08-06T11:59:59.000Z' }, NOW)).toBe(
      'revoked',
    );
  });

  it('is never-seen for a token that has not sent a heartbeat yet', () => {
    expect(heartbeatStatus({ revoked: false }, NOW)).toBe('never-seen');
  });

  it('is online within the staleness window', () => {
    expect(heartbeatStatus({ revoked: false, lastSeenAt: '2026-08-06T11:59:00.000Z' }, NOW)).toBe(
      'online',
    );
  });

  it('is stale once the window has passed', () => {
    expect(heartbeatStatus({ revoked: false, lastSeenAt: '2026-08-06T11:55:00.000Z' }, NOW)).toBe(
      'stale',
    );
  });
});
