import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AbbreviationReviewSection,
  type AbbreviationCandidateRow,
} from './AbbreviationReviewSection.js';
import { withIntl } from '../i18n/test-support.js';
import { ControlApiError } from '../lib/api-client.js';

function row(overrides: Partial<AbbreviationCandidateRow> = {}): AbbreviationCandidateRow {
  return {
    entrantId: 'entrant-1',
    displayName: 'Club Atlético Talleres',
    ...overrides,
  };
}

describe('AbbreviationReviewSection', () => {
  it('shows an empty state when no entrant needs an abbreviation', () => {
    render(withIntl(<AbbreviationReviewSection rows={[]} />));
    expect(screen.getByText('Every entrant already has an abbreviation.')).toBeDefined();
  });

  it('sets a valid abbreviation and removes the entrant from the list on success', async () => {
    const onSetAbbreviation =
      jest.fn<(entrantId: string, abbreviation: string) => Promise<unknown>>();
    onSetAbbreviation.mockResolvedValue(undefined);

    render(
      withIntl(<AbbreviationReviewSection onSetAbbreviation={onSetAbbreviation} rows={[row()]} />),
    );

    fireEvent.change(screen.getByLabelText('Abbreviation for Club Atlético Talleres'), {
      target: { value: 'TAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    await waitFor(() => expect(onSetAbbreviation).toHaveBeenCalledWith('entrant-1', 'TAL'));
  });

  it('shows a format error for a malformed value and never calls the callback', () => {
    const onSetAbbreviation =
      jest.fn<(entrantId: string, abbreviation: string) => Promise<unknown>>();
    render(
      withIntl(<AbbreviationReviewSection onSetAbbreviation={onSetAbbreviation} rows={[row()]} />),
    );

    fireEvent.change(screen.getByLabelText('Abbreviation for Club Atlético Talleres'), {
      target: { value: 'tal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(
      screen.getByText(
        'Uppercase letters and digits only, separated by single spaces, up to 10 characters.',
      ),
    ).toBeDefined();
    expect(onSetAbbreviation).not.toHaveBeenCalled();
  });

  it('shows a format error when submitted with no draft typed at all', () => {
    render(withIntl(<AbbreviationReviewSection rows={[row()]} />));

    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(
      screen.getByText(
        'Uppercase letters and digits only, separated by single spaces, up to 10 characters.',
      ),
    ).toBeDefined();
  });

  it('shows the collision message inline and keeps the entrant listed', async () => {
    const onSetAbbreviation =
      jest.fn<(entrantId: string, abbreviation: string) => Promise<unknown>>();
    onSetAbbreviation.mockRejectedValue(
      new ControlApiError(
        409,
        'Abbreviation "TAL" is already used by another entrant in this tournament',
      ),
    );

    render(
      withIntl(<AbbreviationReviewSection onSetAbbreviation={onSetAbbreviation} rows={[row()]} />),
    );

    fireEvent.change(screen.getByLabelText('Abbreviation for Club Atlético Talleres'), {
      target: { value: 'TAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Abbreviation "TAL" is already used by another entrant in this tournament',
        ),
      ).toBeDefined(),
    );
    expect(screen.getByText('Club Atlético Talleres')).toBeDefined();
  });

  it('shows a generic failure message for a non-API error', async () => {
    const onSetAbbreviation =
      jest.fn<(entrantId: string, abbreviation: string) => Promise<unknown>>();
    onSetAbbreviation.mockRejectedValue(new Error('network down'));

    render(
      withIntl(<AbbreviationReviewSection onSetAbbreviation={onSetAbbreviation} rows={[row()]} />),
    );

    fireEvent.change(screen.getByLabelText('Abbreviation for Club Atlético Talleres'), {
      target: { value: 'TAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    await waitFor(() =>
      expect(screen.getByText('The request could not be completed. Try again.')).toBeDefined(),
    );
  });

  it('does nothing when no callback is provided', () => {
    render(withIntl(<AbbreviationReviewSection rows={[row()]} />));

    fireEvent.change(screen.getByLabelText('Abbreviation for Club Atlético Talleres'), {
      target: { value: 'TAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(screen.getByText('Club Atlético Talleres')).toBeDefined();
  });
});
