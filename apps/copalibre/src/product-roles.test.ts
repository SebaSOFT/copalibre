import { resolveProductRole } from './product-roles.js';

describe('resolveProductRole', () => {
  it('uses a valid command argument before the environment', () => {
    expect(resolveProductRole(['worker'], { PRODUCT_ROLE: 'api' })).toEqual({
      ok: true,
      role: 'worker',
      source: 'argument',
      roleArguments: [],
    });
  });

  it('uses PRODUCT_ROLE when no command argument is given', () => {
    expect(resolveProductRole([], { PRODUCT_ROLE: 'events' })).toEqual({
      ok: true,
      role: 'events',
      source: 'environment',
      roleArguments: [],
    });
  });

  it('refuses a missing role before starting a process', () => {
    expect(resolveProductRole([], {})).toMatchObject({
      ok: false,
      message: expect.stringContaining('PRODUCT_ROLE'),
    });
  });

  it('refuses an unrecognized role', () => {
    expect(resolveProductRole(['frontend'], {})).toMatchObject({
      ok: false,
      message: expect.stringContaining('Unrecognized'),
    });
  });

  it('refuses an invalid PRODUCT_ROLE when no argument overrides it', () => {
    expect(resolveProductRole([], { PRODUCT_ROLE: 'frontend' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('frontend'),
    });
  });

  it('passes arguments through when PRODUCT_ROLE selects the role', () => {
    expect(resolveProductRole(['--down'], { PRODUCT_ROLE: 'migrate' })).toEqual({
      ok: true,
      role: 'migrate',
      source: 'environment',
      roleArguments: ['--down'],
    });
  });

  it('accepts create-admin as a role, passing its CLI arguments through', () => {
    expect(
      resolveProductRole(
        [
          '--organization-alias',
          'my-league',
          '--organization-name',
          'My League',
          '--email',
          'a@b.c',
        ],
        { PRODUCT_ROLE: 'create-admin' },
      ),
    ).toEqual({
      ok: true,
      role: 'create-admin',
      source: 'environment',
      roleArguments: [
        '--organization-alias',
        'my-league',
        '--organization-name',
        'My League',
        '--email',
        'a@b.c',
      ],
    });
  });
});
