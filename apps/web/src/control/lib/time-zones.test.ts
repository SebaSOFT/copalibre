import { timeZoneOptions } from './time-zones.js';

describe('timeZoneOptions', () => {
  it('lists the platform zones with UTC, sorted', () => {
    const values = timeZoneOptions('').map((option) => option.value);
    expect(values).toContain('Europe/Paris');
    expect(values).toContain('UTC');
    expect(values).toEqual([...values].sort());
  });

  it('keeps a saved zone the platform list does not know', () => {
    expect(timeZoneOptions('Mars/Olympus').map((option) => option.value)).toContain('Mars/Olympus');
  });

  it('labels each zone with its own identifier', () => {
    for (const option of timeZoneOptions('')) expect(option.label).toBe(option.value);
  });
});
