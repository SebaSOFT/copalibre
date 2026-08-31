import { assertPatScopesAllowed } from './auth.controller.js';
import { SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';

describe('assertPatScopesAllowed', () => {
  const callerScopes = ['copalibre.control', 'copalibre.participant'];

  it('passes when requested is a strict subset of the caller scopes', () => {
    expect(() => assertPatScopesAllowed(['copalibre.control'], callerScopes)).not.toThrow();
  });

  it('passes when requested equals the caller scopes', () => {
    expect(() => assertPatScopesAllowed([...callerScopes], callerScopes)).not.toThrow();
  });

  it('passes when requested is empty', () => {
    expect(() => assertPatScopesAllowed([], callerScopes)).not.toThrow();
  });

  it('throws when requested includes a scope the caller does not hold', () => {
    expect(() =>
      assertPatScopesAllowed(['copalibre.control', 'copalibre.integration'], callerScopes),
    ).toThrow(/copalibre\.integration/);
  });

  it(`throws on ${SUPER_ADMIN_SCOPE} even when the caller holds it`, () => {
    const superAdminCaller = [...callerScopes, SUPER_ADMIN_SCOPE];
    expect(() => assertPatScopesAllowed([SUPER_ADMIN_SCOPE], superAdminCaller)).toThrow(
      /cannot be attached/,
    );
  });
});
