import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TournamentAuthoringPage } from './components/TournamentAuthoringPage.js';
import { RegistrationReviewRoute } from './components/RegistrationReviewRoute.js';
import type { ControlApiClient } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

function client(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listMyOrganizations: async () => [],
    listDisciplines: async () => [
      {
        descriptorId: 'd-football',
        version: '1.0.0',
        name: 'Fútbol',
        supportedFormats: ['round-robin'],
      },
    ],
    createTournament: async () => ({
      tournamentId: 't-1',
      alias: 'copa-verano',
      name: 'Copa Verano',
    }),
    listRegistrations: async () => [],
    fetchStandings: async () => ({
      stageId: 's-1',
      projectionVersion: 0,
      fullyResolved: true,
      rows: [],
      trace: [],
    }),
    fetchTiebreakTrace: async () => ({ entrantId: 'e-1', lines: [] }),
    fetchTableLayouts: async () => [],
    fetchTableProjection: async () => {
      throw new Error('fetchTableProjection not stubbed in this test');
    },
    fetchSeeding: async () => ({
      stageId: 's-1',
      format: 'round-robin',
      seeds: [],
      matches: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({
      mutationClass: 'safe' as const,
      reason: '',
      invalidates: [],
      persisted: true,
    }),
    bulkReview: async () => ({ applied: [], refused: [] }),
    reviewRegistration: async () => ({
      entrantId: 'e-1',
      tournamentId: 't-1',
      status: 'withdrawn',
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

describe('the tournament authoring route container', () => {
  it('loads disciplines from the API and posts the wizard request', async () => {
    const requests: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <TournamentAuthoringPage
            organizationAlias="liga-mendocina"
            client={client({
              createTournament: async (_organizationAlias, request) => {
                requests.push(request);
                return { tournamentId: 't-1', alias: request.alias, name: request.name };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ descriptorVersion: '1.0.0', format: 'round-robin' });
  });
});

describe('the registration review route container', () => {
  it('uploads, reviews and confirms a participant CSV', async () => {
    const calls: string[] = [];
    const preview = {
      importId: 'import-1',
      target: 'team' as const,
      status: 'review-ready',
      sourceHash: 'source-hash',
      preview: { valid: true, rows: [], errors: [] },
    };

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createCsvImport: async (_organizationAlias, _tournamentAlias, request) => {
                calls.push(request.sourceCsv);
                return { ...preview, status: 'queued' };
              },
              fetchCsvImport: async () => preview,
              commitCsvImport: async (
                _organizationAlias,
                _tournamentAlias,
                importId,
                sourceHash,
              ) => {
                calls.push(`${importId}:${sourceHash}`);
                return { ...preview, status: 'committed' };
              },
            })}
          />,
        ),
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Participants CSV'), {
        target: { files: [{ text: async () => 'alias,name\nclub-atletico,Club Atletico\n' }] },
      });
    });

    await waitFor(() => expect(screen.getByText('Valid preview.')).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    });

    expect(calls).toEqual(['alias,name\nclub-atletico,Club Atletico\n', 'import-1:source-hash']);
    expect(screen.getByText('Import confirmed.')).toBeDefined();
  });

  it('renders row errors and keeps an invalid CSV preview uncommittable', async () => {
    const invalid = {
      importId: 'import-1',
      target: 'team' as const,
      status: 'invalid',
      sourceHash: 'source-hash',
      preview: {
        valid: false,
        rows: [{ rowNumber: 2, errors: [{ message: 'name is required' }] }],
        errors: [{ message: 'The file has invalid rows' }],
      },
    };

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createCsvImport: async () => ({ ...invalid, status: 'queued' }),
              fetchCsvImport: async () => invalid,
              commitCsvImport: async () => invalid,
            })}
          />,
        ),
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Participants CSV'), {
        target: { files: [{ text: async () => 'alias,name\nclub-atletico,\n' }] },
      });
    });

    await waitFor(() => expect(screen.getByText('Preview has errors.')).toBeDefined());
    expect(screen.getByText('The file has invalid rows')).toBeDefined();
    expect(screen.getByText('Row 2: name is required')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveProperty('disabled', true);
  });

  it('loads registrations and sends selected ids to the bulk endpoint', async () => {
    const reviewed: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                { entrantId: 'e-1', tournamentId: 't-1', status: 'pending', teamId: 'team-1' },
              ],
              bulkReview: async (_organizationAlias, _tournamentAlias, request) => {
                reviewed.push(request);
                return {
                  applied: [
                    { entrantId: 'e-1', tournamentId: 't-1', status: 'accepted', teamId: 'team-1' },
                  ],
                  refused: [],
                };
              },
            })}
            now="2026-08-01T17:00:00.000Z"
          />,
        ),
      );
    });

    fireEvent.click(screen.getByLabelText('Select team-1'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    });

    expect(reviewed).toEqual([{ entrantIds: ['e-1'], decision: 'accepted' }]);
    // The status filter's own "Accepted" option shares its text with the row
    // badge in English (Spanish's grammatical agreement kept them distinct:
    // "Aceptados" vs "Aceptada") — scope to the badge specifically.
    expect(document.querySelector('.cl-badge')?.textContent).toBe('Accepted');
  });

  it('revokes one expanded registration through the per-entrant endpoint', async () => {
    const reviewed: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                { entrantId: 'e-1', tournamentId: 't-1', status: 'pending', teamId: 'team-1' },
              ],
              reviewRegistration: async (
                _organizationAlias,
                _tournamentAlias,
                entrantId,
                request,
              ) => {
                reviewed.push({ entrantId, request });
                return {
                  entrantId,
                  tournamentId: 't-1',
                  status: 'withdrawn',
                  teamId: 'team-1',
                };
              },
            })}
            now="2026-08-01T17:00:00.000Z"
          />,
        ),
      );
    });

    const summary = screen.getByLabelText('Select team-1').closest('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    });

    expect(reviewed).toEqual([
      {
        entrantId: 'e-1',
        request: {
          decision: 'withdrawn',
          reason: 'Revoked from registration review',
        },
      },
    ]);
    expect(screen.getByText('Withdrawn')).toBeDefined();
  });

  it('shows a load-failure message when registrations fail to load', async () => {
    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => {
                throw new Error('network down');
              },
            })}
          />,
        ),
      );
    });

    expect(screen.getByText('Could not load the registrations.')).toBeDefined();
  });

  it('shows a create-import failure message when the CSV upload is rejected', async () => {
    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createCsvImport: async () => {
                throw new Error('rejected');
              },
            })}
          />,
        ),
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Participants CSV'), {
        target: { files: [{ text: async () => 'alias,name\nclub-atletico,Club Atletico\n' }] },
      });
    });

    await waitFor(() => expect(screen.getByText('Could not create the import.')).toBeDefined());
  });

  it('sets a nationality and uploads a photo through the API when the client supports it', async () => {
    const nationalityCalls: unknown[] = [];
    const photoCalls: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                { entrantId: 'e-1', tournamentId: 't-1', status: 'pending', personId: 'person-1' },
              ],
              setPersonNationality: async (organizationAlias, personId, nationality) => {
                nationalityCalls.push({ organizationAlias, personId, nationality });
                return { personId, nationality };
              },
              uploadPersonPhoto: async (organizationAlias, personId, request) => {
                photoCalls.push({ organizationAlias, personId, request });
                return { objectId: 'object-1' };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByText('person-1'));
    fireEvent.click(screen.getByText('Argentina'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(nationalityCalls).toEqual([
      { organizationAlias: 'liga-mendocina', personId: 'person-1', nationality: 'AR' },
    ]);

    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Upload photo'), { target: { files: [file] } });
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.load(dialog.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Use image'));
    });
    await waitFor(() => expect(photoCalls).toHaveLength(1));
  });

  it('loads entrants needing an abbreviation and removes one from the list once set (0111)', async () => {
    const calls: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listEntrantsNeedingAbbreviation: async () => [
                { entrantId: 'e-2', tournamentId: 't-1', status: 'accepted', teamId: 'team-2' },
              ],
              setEntrantAbbreviation: async (
                organizationAlias,
                tournamentAlias,
                entrantId,
                request,
              ) => {
                calls.push({ organizationAlias, tournamentAlias, entrantId, request });
                return { entrantId, tournamentId: 't-1', status: 'accepted', abbreviation: 'TAL' };
              },
            })}
          />,
        ),
      );
    });

    expect(screen.getByText('team-2')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Abbreviation for team-2'), {
      target: { value: 'TAL' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    });

    expect(calls).toEqual([
      {
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        entrantId: 'e-2',
        request: { abbreviation: 'TAL' },
      },
    ]);
    await waitFor(() =>
      expect(screen.getByText('Every entrant already has an abbreviation.')).toBeDefined(),
    );
  });
});
