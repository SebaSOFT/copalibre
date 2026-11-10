import {
  DEFAULT_TRUSTED_PROXIES,
  TRUSTED_PROXIES_ENV,
  trustedProxiesFromEnv,
} from './trusted-proxies.js';

describe('trusted proxies', () => {
  it('defaults to loopback, link-local and private networks', () => {
    expect(trustedProxiesFromEnv({})).toEqual(DEFAULT_TRUSTED_PROXIES);
    expect(trustedProxiesFromEnv({ [TRUSTED_PROXIES_ENV]: '  ' })).toEqual(DEFAULT_TRUSTED_PROXIES);
  });

  it('reads addresses, ranges and presets', () => {
    expect(
      trustedProxiesFromEnv({ [TRUSTED_PROXIES_ENV]: '203.0.113.0/24, loopback, 2001:db8::1' }),
    ).toEqual(['203.0.113.0/24', 'loopback', '2001:db8::1']);
  });

  it('trusts no peer with none', () => {
    expect(trustedProxiesFromEnv({ [TRUSTED_PROXIES_ENV]: 'NONE' })).toBe(false);
  });

  it.each(['true', '*', 'gateway', '10.0.0.0/33', '10.0.0.0/8/1', '::/abc'])(
    'refuses %s',
    (value) => {
      expect(() => trustedProxiesFromEnv({ [TRUSTED_PROXIES_ENV]: value })).toThrow(
        TRUSTED_PROXIES_ENV,
      );
    },
  );

  it.each(['0.0.0.0/0', '::/0'])('refuses %s, which trusts every address', (value) => {
    expect(() => trustedProxiesFromEnv({ [TRUSTED_PROXIES_ENV]: value })).toThrow(
      /must not trust every address/,
    );
  });
});
