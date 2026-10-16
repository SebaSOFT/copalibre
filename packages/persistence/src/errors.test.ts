import {
  InvariantViolationError,
  NotFoundError,
  ScheduleReasonRequiredError,
  SchemaVersionMismatchError,
} from './errors.js';

describe('persistence errors', () => {
  it.each([
    [InvariantViolationError, 'DOMAIN_INVARIANT_VIOLATION'],
    [SchemaVersionMismatchError, 'SCHEMA_VERSION_MISMATCH'],
    [NotFoundError, 'NOT_FOUND'],
  ])('%p carries a stable code and details', (Ctor, code) => {
    const error = new Ctor('boom', { entityId: 'x' });
    expect(error.code).toBe(code);
    expect(error.details?.entityId).toBe('x');
    expect(error.name).toBe(Ctor.name);
    expect(error).toBeInstanceOf(Error);
  });

  it('names every published match a schedule batch left without a reason', () => {
    const error = new ScheduleReasonRequiredError(['m1', 'm2']);
    expect(error.code).toBe('SCHEDULE_REASON_REQUIRED');
    expect(error.matchIds).toEqual(['m1', 'm2']);
    expect(error.details).toEqual({ matchIds: ['m1', 'm2'] });
    expect(error.message).toContain('m1, m2');
  });
});
