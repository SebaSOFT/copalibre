import { SUPPORTED_LANGUAGES } from '@copalibre/domain';
import { isReservedOrganizationAlias, RESERVED_PREFIXES } from './public-route-guards.js';

describe('public organization route guards', () => {
  it('reserves every supported locale before organization lookup', () => {
    for (const locale of SUPPORTED_LANGUAGES) {
      expect(RESERVED_PREFIXES.has(locale)).toBe(true);
      expect(isReservedOrganizationAlias(locale)).toBe(true);
    }
  });

  it('keeps reserved prefixes case-insensitive and allows ordinary aliases', () => {
    expect(isReservedOrganizationAlias('CONTROL')).toBe(true);
    expect(isReservedOrganizationAlias('liga-mendocina')).toBe(false);
  });
});
