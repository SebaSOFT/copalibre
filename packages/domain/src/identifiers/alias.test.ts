import { InvalidAliasError } from '../errors.js';
import { unwrap } from '../result.js';
import { Alias, type AliasScope, RESERVED_ORGANIZATION_ALIASES } from './alias.js';

const SCOPES: readonly AliasScope[] = [
  'organization',
  'tournament',
  'circuit',
  'entrant',
  'club',
  'venue',
];
const RESERVED = Object.values(RESERVED_ORGANIZATION_ALIASES).flat();

describe('Alias', () => {
  it.each(['copa-verano-2026', 'liga1', 'a', 'x-9-y'])('accepts kebab-case "%s"', (value) => {
    expect(Alias.create('tournament', value).ok).toBe(true);
  });

  it.each([
    ['uppercase', 'Copa-Verano'],
    ['spaces', 'copa verano'],
    ['underscores', 'copa_verano'],
    ['leading hyphen', '-copa'],
    ['trailing hyphen', 'copa-'],
    ['double hyphen', 'copa--verano'],
    ['empty', ''],
    ['accented characters', 'copa-libré'],
  ])('rejects %s with a typed error', (_label, value) => {
    const result = Alias.create('tournament', value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidAliasError);
      expect(result.error.code).toBe('INVALID_ALIAS');
    }
  });

  it('rejects values longer than 64 characters', () => {
    expect(Alias.create('organization', 'a'.repeat(65)).ok).toBe(false);
  });

  it('scopes organization aliases installation-wide', () => {
    const alias = unwrap(Alias.create('organization', 'club-atlas'));
    expect(alias.uniquenessScope()).toBe('installation');
    expect(unwrap(alias.uniquenessKey())).toBe('organization:club-atlas');
  });

  it('scopes tournament aliases per organization', () => {
    const alias = unwrap(Alias.create('tournament', 'copa-verano'));
    expect(alias.uniquenessScope()).toBe('organization');
    const inOrgA = unwrap(alias.uniquenessKey('org-a'));
    const inOrgB = unwrap(alias.uniquenessKey('org-b'));
    expect(inOrgA).not.toBe(inOrgB);
    expect(inOrgA).toBe(unwrap(alias.uniquenessKey('org-a')));
  });

  it('requires an organizationId for non-organization scopes', () => {
    const alias = unwrap(Alias.create('entrant', 'jugador-uno'));
    const result = alias.uniquenessKey();
    expect(result.ok).toBe(false);
  });

  it('never collides across scopes for the same value', () => {
    const tournament = unwrap(Alias.create('tournament', 'atlas'));
    const circuit = unwrap(Alias.create('circuit', 'atlas'));
    expect(unwrap(tournament.uniquenessKey('org-a'))).not.toBe(
      unwrap(circuit.uniquenessKey('org-a')),
    );
  });

  it('compares equality on scope and value', () => {
    const a = unwrap(Alias.create('tournament', 'copa'));
    const b = unwrap(Alias.create('tournament', 'copa'));
    const c = unwrap(Alias.create('circuit', 'copa'));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  describe('reserved organization aliases', () => {
    it.each(RESERVED)('rejects "%s" for an organization and names it reserved', (value) => {
      const result = Alias.create('organization', value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(InvalidAliasError);
        expect(result.error.message).toContain('reserved');
      }
    });

    it.each(RESERVED)('accepts "%s" for a tournament', (value) => {
      expect(Alias.create('tournament', value).ok).toBe(true);
    });

    it.each(['login-fc', 'tv-azteca', 'club-root', 'app2'])(
      'accepts "%s", which only contains a reserved name',
      (value) => {
        expect(Alias.create('organization', value).ok).toBe(true);
      },
    );

    it('every reserved name is itself a valid alias, so the list can be reached', () => {
      for (const value of RESERVED) {
        expect(Alias.create('tournament', value).ok).toBe(true);
      }
    });
  });

  describe('attack payloads', () => {
    const payloads: readonly (readonly [string, string])[] = [
      ['script tag', '<script>alert(1)</script>'],
      ['attribute break-out', 'a"onmouseover="x'],
      ['SQL injection', "x' or 1=1--"],
      ['SQL comment', 'a;drop table organization'],
      ['path traversal', '../etc/passwd'],
      ['encoded traversal', '%2e%2e'],
      ['javascript URL', 'javascript:alert(1)'],
      ['trailing newline', 'copa\n'],
      ['CRLF injection', 'copa\r\nset-cookie'],
      ['null byte', 'copa\u0000'],
      ['Cyrillic look-alike', '\u0430dmin'],
      ['fullwidth look-alike', '\uff41pp'],
      ['prototype key', '__proto__'],
      ['dotted member', 'con.struct'],
      ['backslash', 'a\\b'],
    ];

    it.each(SCOPES.flatMap((scope) => payloads.map(([label, value]) => [scope, label, value])))(
      'rejects for %s: %s',
      (scope, _label, value) => {
        expect(Alias.create(scope as AliasScope, value as string).ok).toBe(false);
      },
    );
  });
});
