import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RegistrationReviewPage, type ReviewRegistrationRow } from './RegistrationReviewPage.js';
import { withIntl } from '../i18n/test-support.js';
import type { BulkReviewRequest, UploadImageRequest } from '../lib/api-client.js';

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
  const onSetNationality = jest.fn<(personId: string, nationality: string | null) => void>();
  const onUploadPhoto = jest.fn<(personId: string, request: UploadImageRequest) => void>();
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

  it('reads a selected photo file and uploads it as base64', async () => {
    const { onUploadPhoto } = renderPage();
    fireEvent.click(screen.getByText('Elías Salomón'));

    const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload photo') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUploadPhoto).toHaveBeenCalled());
    const [personId, request] = onUploadPhoto.mock.calls[0] as [string, UploadImageRequest];
    expect(personId).toBe('person-1');
    expect(request.filename).toBe('photo.png');
    expect(request.contentType).toBe('image/png');
    expect(request.contentBase64.length).toBeGreaterThan(0);
  });

  it('does nothing when the file input changes with no file selected', () => {
    const { onUploadPhoto } = renderPage();
    fireEvent.click(screen.getByText('Elías Salomón'));

    const input = screen.getByLabelText('Upload photo') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });

    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('invokes the bulk-refuse callback for selected rows', () => {
    const onBulkReview = jest.fn<(request: BulkReviewRequest) => void>();
    render(
      withIntl(
        <RegistrationReviewPage
          now="2026-08-01T00:00:00.000Z"
          onBulkReview={onBulkReview}
          organizationAlias="liga-orbital"
          rows={[row({ personId: 'person-1' })]}
          tournamentName="Copa Verano"
        />,
      ),
    );

    fireEvent.click(screen.getByLabelText('Select Elías Salomón'));
    fireEvent.click(screen.getByRole('button', { name: 'Refuse' }));

    expect(onBulkReview).toHaveBeenCalledWith({ entrantIds: ['entrant-1'], decision: 'refused' });
  });
});
