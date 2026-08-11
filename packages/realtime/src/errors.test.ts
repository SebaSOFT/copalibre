import { classifyError, classifyStatus, isAbort } from './errors.js';

describe('which failures are worth retrying', () => {
  it('treats an expired token as recoverable, once renewed', () => {
    // A console left open through a match outlives its access token; that is
    // the ordinary case, not an error.
    expect(classifyStatus(401)).toEqual({
      kind: 'recoverable',
      reason: 'access token expired',
      renewToken: true,
    });
  });

  it('treats a refusal as fatal, because retrying changes nobody’s mind', () => {
    expect(classifyStatus(403).kind).toBe('fatal');
    expect(classifyStatus(404).kind).toBe('fatal');
    expect(classifyStatus(400).kind).toBe('fatal');
  });

  it('treats rate limiting as recoverable: the server asked for room', () => {
    expect(classifyStatus(429)).toMatchObject({ kind: 'recoverable', renewToken: false });
  });

  it.each([500, 502, 503])('treats %d as recoverable', (status) => {
    expect(classifyStatus(status).kind).toBe('recoverable');
  });

  it('retries an unexpected non-error status rather than giving up', () => {
    expect(classifyStatus(204).kind).toBe('recoverable');
  });
});

describe('a thrown error', () => {
  it('is recoverable, carrying its message', () => {
    expect(classifyError(new Error('network down'))).toEqual({
      kind: 'recoverable',
      reason: 'network down',
      renewToken: false,
    });
  });

  it('reports a non-Error as text rather than as [object Object]', () => {
    expect(classifyError({ code: 7 })?.reason).toBe('[object Object]');
  });

  it('is nothing at all when the caller aborted', () => {
    // A page that navigated away must stop; treating its own teardown as a
    // dropped connection is how a closed tab keeps reconnecting.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(classifyError(abort)).toBeUndefined();
    expect(isAbort(abort)).toBe(true);
    expect(isAbort(new Error('other'))).toBe(false);
    expect(isAbort(undefined)).toBe(false);
  });
});
