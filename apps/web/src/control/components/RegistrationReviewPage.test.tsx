import { jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RegistrationReviewPage, type ReviewRegistrationRow } from './RegistrationReviewPage.js';
import { withIntl } from '../i18n/test-support.js';

function row(overrides: Partial<ReviewRegistrationRow> = {}): ReviewRegistrationRow {
  return {
    entrantId: 'entrant-1',
    displayName: 'Elías Salomón',
    status: 'pending',
    submittedAt: '2026-08-01T00:00:00.000Z',
    contactEmail: 'elias@example.test',
    teamMembers: [],
    experience: 'N/A',
    requiresCheckIn: false,
    ...overrides,
  };
}

function renderPage(overrides: Partial<Parameters<typeof RegistrationReviewPage>[0]> = {}) {
  const onSetNationality = jest.fn();
  const onUploadPhoto = jest.fn();
  render(
    withIntl(
      <RegistrationReviewPage
        now="2026-08-01T00:00:00.000Z"
        onSetNationality={onSetNationality}
        onUploadPhoto={onUploadPhoto}
        organizationAlias="liga-orbital"
        rows={[row({ personId: 'person-1' })]}
        tournamentName="Copa Verano"
        {...overrides}
      />,
    ),
  );
  return { onSetNationality, onUploadPhoto };
}

describe('RegistrationReviewPage — nationality and profile (0093)', () => {
  it("shows the person's flag next to their name once a nationality is set", () => {
    renderPage({ rows: [row({ personId: 'person-1', nationality: 'AR' })] });
    const summary = screen.getByText('Elías Salomón').closest('summary') as HTMLElement;
    expect(within(summary).getByText('🇦🇷')).toBeDefined();
  });

  it('shows no flag next to the name when the person has no nationality', () => {
    renderPage();
    const summary = screen.getByText('Elías Salomón').closest('summary') as HTMLElement;
    expect(within(summary).queryByText('🇦🇷')).toBeNull();
  });

  it('offers no nationality editor for a team-kind row (no personId)', () => {
    renderPage({ rows: [row({ personId: undefined })] });
    expect(screen.queryByText('View profile')).toBeNull();
  });

  it('opens the expandable detail to reveal the country selector and saves the selection', () => {
    const { onSetNationality } = renderPage();
    fireEvent.click(screen.getByText('Elías Salomón'));

    fireEvent.click(screen.getByText('Argentina'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSetNationality).toHaveBeenCalledWith('person-1', 'AR');
  });

  it('links to the person profile route for a person-kind row', () => {
    renderPage();
    const link = screen.getByText('View profile').closest('a');
    expect(link?.getAttribute('href')).toBe('/control/liga-orbital/persons/person-1');
  });
});
