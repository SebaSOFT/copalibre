import { jest } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BroadcasterStudioPage } from './BroadcasterStudioPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient, DisplayTokenIssuedResponse } from '../../lib/api-client.js';

function client(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listMyOrganizations: async () => [],
    listDisciplines: async () => [],
    createTournament: async () => ({ tournamentId: 't-1', alias: 't-1', name: 'Test' }),
    listRegistrations: async () => [],
    bulkReview: async () => ({ applied: [], refused: [] }),
    reviewRegistration: async () => ({
      entrantId: 'entrant',
      tournamentId: 'tournament',
      status: 'accepted',
    }),
    fetchStandings: async () => ({
      stageId: 'stage',
      projectionVersion: 0,
      fullyResolved: true,
      rows: [],
      trace: [],
    }),
    fetchTiebreakTrace: async () => ({ entrantId: 'entrant', lines: [] }),
    fetchTableLayouts: async () => [],
    fetchTableProjection: async () => {
      throw new Error('fetchTableProjection not stubbed in this test');
    },
    fetchSeeding: async () => ({
      stageId: 'stage',
      format: 'round-robin',
      seeds: [],
      zones: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({
      mutationClass: 'safe' as const,
      reason: '',
      invalidates: [],
      persisted: true,
    }),
    listOrganizationRoles: async () => [],
    inviteOrganizationUser: async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
    changeOrganizationRole: async () => ({
      assignmentId: 'assignment-1',
      principalId: 'principal-1',
      email: 'user@example.test',
      role: 'viewer',
      status: 'active',
    }),
    deleteOrganizationRole: async () => undefined,
    ...overrides,
  };
}

function issued(overrides: Partial<DisplayTokenIssuedResponse> = {}): DisplayTokenIssuedResponse {
  return {
    displayTokenId: 'dt-1',
    token: 'raw-token',
    url: 'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=raw-token',
    ...overrides,
  };
}

describe('BroadcasterStudioPage (openspec 0300)', () => {
  it('issues a token on mount and shows the resulting overlay URL with the default mode/chroma', async () => {
    render(
      withIntl(
        <BroadcasterStudioPage
          client={client({ issueDisplayToken: async () => issued() })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    const input = await screen.findByLabelText('OBS Browser Source URL');
    expect((input as HTMLInputElement).value).toBe(
      'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=raw-token&mode=overlay-lower',
    );
  });

  it('shows a loading state before the token resolves', () => {
    render(
      withIntl(
        <BroadcasterStudioPage
          client={client({ issueDisplayToken: () => new Promise(() => undefined) })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(screen.getByText('Generating your streaming link…')).toBeDefined();
  });

  it('shows an error when the client offers no issuance endpoint', async () => {
    render(
      withIntl(
        <BroadcasterStudioPage
          client={client()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(
      await screen.findByText('Could not generate a streaming link. Try reloading this page.'),
    ).toBeDefined();
  });

  it('shows an error when issuance itself fails', async () => {
    render(
      withIntl(
        <BroadcasterStudioPage
          client={client({
            issueDisplayToken: async () => {
              throw new Error('network down');
            },
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(
      await screen.findByText('Could not generate a streaming link. Try reloading this page.'),
    ).toBeDefined();
  });

  it('updates the URL when the mode or chroma preview toggle changes', async () => {
    render(
      withIntl(
        <BroadcasterStudioPage
          client={client({ issueDisplayToken: async () => issued() })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    const input = (await screen.findByLabelText('OBS Browser Source URL')) as HTMLInputElement;

    fireEvent.change(screen.getByLabelText('Overlay mode'), { target: { value: 'overlay-full' } });
    await waitFor(() => expect(input.value).toContain('mode=overlay-full'));

    fireEvent.change(screen.getByLabelText('Preview background'), { target: { value: 'green' } });
    await waitFor(() => expect(input.value).toContain('chroma=00FF00'));
  });

  it('copies the overlay URL to the clipboard and confirms success', async () => {
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      withIntl(
        <BroadcasterStudioPage
          client={client({ issueDisplayToken: async () => issued() })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('OBS Browser Source URL');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy OBS Browser Source URL' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=raw-token&mode=overlay-lower',
    );
    expect(await screen.findByText('URL copied to clipboard')).toBeDefined();
  });
});
