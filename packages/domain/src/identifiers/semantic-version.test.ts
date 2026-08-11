import { latestVersion, SemanticVersion } from './semantic-version.js';
import { unwrap } from '../result.js';

const v = (input: string) => unwrap(SemanticVersion.create(input));

describe('SemanticVersion', () => {
  it.each(['1.0.0', '0.1.2', '10.20.30', '1.0.0-alpha.1', 'v2.3.4'])('accepts %s', (input) => {
    expect(SemanticVersion.create(input).ok).toBe(true);
  });

  it.each(['1', '1.0', 'latest', '', '1.0.0.0', 'v'])('rejects %s', (input) => {
    const result = SemanticVersion.create(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SEMANTIC_VERSION');
  });

  it('normalises a leading v so equal versions compare equal', () => {
    expect(v('v1.2.3').equals(v('1.2.3'))).toBe(true);
    expect(v('v1.2.3').value).toBe('1.2.3');
  });

  it('orders by precedence, not lexicographically', () => {
    // Lexicographic ordering would put "10.0.0" before "9.0.0".
    expect(v('10.0.0').compare(v('9.0.0'))).toBe(1);
    expect(v('1.0.0').compare(v('1.0.1'))).toBe(-1);
    expect(v('1.0.0').compare(v('1.0.0'))).toBe(0);
  });

  it('treats a prerelease as lower than its release', () => {
    expect(v('1.0.0-alpha.1').compare(v('1.0.0'))).toBe(-1);
  });

  it('exposes major, minor and patch', () => {
    const version = v('4.5.6');
    expect([version.major, version.minor, version.patch]).toEqual([4, 5, 6]);
  });

  it('stringifies to the normalised value', () => {
    expect(`${v('v1.2.3')}`).toBe('1.2.3');
  });
});

describe('latestVersion', () => {
  it('returns the highest by precedence', () => {
    expect(latestVersion([v('1.0.0'), v('10.0.0'), v('9.9.9')])?.value).toBe('10.0.0');
  });

  it('returns undefined for an empty list', () => {
    expect(latestVersion([])).toBeUndefined();
  });
});
