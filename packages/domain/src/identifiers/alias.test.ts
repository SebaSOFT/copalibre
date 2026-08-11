import { InvalidAliasError } from '../errors.js';
import { unwrap } from '../result.js';
import { Alias } from './alias.js';

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
    const alias = unwrap(Alias.create('participant', 'jugador-uno'));
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
});
