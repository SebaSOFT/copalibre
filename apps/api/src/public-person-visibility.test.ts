import type { Tournament } from '@copalibre/domain';
import { personVisibility, youthProfilesSuppressed } from './public-person-visibility.js';

function tournament(settings: Partial<Tournament> = {}): Tournament {
  return {
    tournamentId: '01890000-0000-7000-8000-000000000001',
    organizationId: '01890000-0000-7000-8000-000000000002',
    alias: 'privacy-cup',
    name: 'Privacy Cup',
    disciplineRef: {
      descriptorId: 'football',
      version: '1.0.0',
    },
    status: 'published',
    featured: false,
    ...settings,
  };
}

describe('public person visibility', () => {
  it('keeps adult profiles available regardless of birth date', () => {
    expect(youthProfilesSuppressed(tournament())).toBe(false);
    expect(personVisibility(tournament())).toEqual({
      hiddenAtRequest: false,
      publicProfileAvailable: true,
      nationalityVisible: true,
    });
  });

  it('shows youth names while suppressing profile details when the organizer has not enabled them', () => {
    const settings = tournament({ includesMinors: true, showYouthProfiles: false });

    expect(youthProfilesSuppressed(settings)).toBe(true);
    expect(personVisibility(settings)).toEqual({
      hiddenAtRequest: false,
      publicProfileAvailable: false,
      nationalityVisible: false,
    });
  });

  it('allows public youth profiles only when the organizer explicitly enables them', () => {
    const settings = tournament({ includesMinors: true, showYouthProfiles: true });

    expect(youthProfilesSuppressed(settings)).toBe(false);
    expect(personVisibility(settings)).toEqual({
      hiddenAtRequest: false,
      publicProfileAvailable: true,
      nationalityVisible: true,
    });
  });

  it('keeps a person-wide opt-out in force even when public youth profiles are enabled', () => {
    expect(
      personVisibility(tournament({ includesMinors: true, showYouthProfiles: true }), true),
    ).toEqual({
      hiddenAtRequest: true,
      publicProfileAvailable: false,
      nationalityVisible: false,
    });
  });
});
