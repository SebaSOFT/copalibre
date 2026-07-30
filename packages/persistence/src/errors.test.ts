import { InvariantViolationError, NotFoundError, SchemaVersionMismatchError } from './errors.js';

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
});
