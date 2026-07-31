import {
  validateOfficial,
  validateVenue,
  validateWindow,
  type Official,
  type Venue,
} from './resource.js';

const venue = (overrides: Partial<Venue> = {}): Venue => ({
  venueId: 'v-1',
  organizationId: 'org-1',
  alias: 'club-central',
  name: 'Club Central',
  concurrentCapacity: 1,
  ...overrides,
});

const official = (overrides: Partial<Official> = {}): Official => ({
  officialId: 'o-1',
  organizationId: 'org-1',
  displayName: 'Ana Gómez',
  roles: ['referee'],
  ...overrides,
});

describe('validateVenue', () => {
  it('accepts a venue that can hold a fixture', () => {
    expect(validateVenue(venue()).ok).toBe(true);
  });

  it('accepts a multi-court venue', () => {
    // Three courts is one venue that hosts three fixtures, not three venues.
    expect(validateVenue(venue({ concurrentCapacity: 3 })).ok).toBe(true);
  });

  it('rejects a venue with no name for an operator to recognise', () => {
    expect(validateVenue(venue({ name: '   ' })).ok).toBe(false);
  });

  it.each([[0], [-1], [1.5]])('rejects a concurrent capacity of %p', (concurrentCapacity) => {
    const result = validateVenue(venue({ concurrentCapacity }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RESOURCE_INVALID');
    expect(result.error.details).toMatchObject({ concurrentCapacity });
  });
});

describe('validateOfficial', () => {
  it('accepts an official with a role', () => {
    expect(validateOfficial(official()).ok).toBe(true);
  });

  it('accepts several roles', () => {
    expect(validateOfficial(official({ roles: ['referee', 'table-official'] })).ok).toBe(true);
  });

  it('rejects an official with no name', () => {
    expect(validateOfficial(official({ displayName: ' ' })).ok).toBe(false);
  });

  it('rejects an official with no role, who could be assigned to nothing', () => {
    const result = validateOfficial(official({ roles: [] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('can be assigned to nothing');
  });
});

describe('validateWindow', () => {
  const startsAt = Date.UTC(2026, 7, 1, 14, 0, 0);

  it('accepts an epoch start and a positive duration', () => {
    expect(validateWindow({ startsAt, durationMinutes: 90 }).ok).toBe(true);
  });

  it.each([[0], [-30]])('rejects a duration of %i minutes', (durationMinutes) => {
    const result = validateWindow({ startsAt, durationMinutes });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ durationMinutes });
  });

  it.each([
    ['a fraction', startsAt + 0.5],
    ['not a number', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('rejects a start that is %s', (_case, badStart) => {
    expect(validateWindow({ startsAt: badStart, durationMinutes: 60 }).ok).toBe(false);
  });
});
