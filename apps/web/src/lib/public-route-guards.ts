import { SUPPORTED_LANGUAGES } from '@copalibre/domain';

export const RESERVED_PREFIXES = new Set([
  'control',
  'help',
  'tv',
  'api',
  'objects',
  'organizations',
  'disciplines',
  'tournament-profiles',
  'health',
  'invitations',
  'runtime-config.json',
  'sitemap.xml',
  'robots.txt',
  ...SUPPORTED_LANGUAGES,
]);

export function isReservedOrganizationAlias(alias: string): boolean {
  return RESERVED_PREFIXES.has(alias.toLowerCase());
}
