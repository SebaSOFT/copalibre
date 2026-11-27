import type { SelectOption } from '../components/ui/atoms/select.js';

/**
 * Every IANA time zone the browser knows, as select options. `UTC` is added because the platform
 * list leaves it out, and so is `current`, so an organization saved with a zone the list lacks
 * still shows what it holds instead of a blank.
 */
export function timeZoneOptions(current: string): readonly SelectOption[] {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  if (current !== '') zones.add(current);
  return [...zones].sort().map((zone) => ({ value: zone, label: zone }));
}
