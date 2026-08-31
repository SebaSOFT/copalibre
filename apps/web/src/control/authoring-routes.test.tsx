import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TournamentAuthoringPage } from './components/TournamentAuthoringPage.js';
import { RegistrationReviewRoute } from './components/RegistrationReviewRoute.js';
import { ControlApiError, type ControlApiClient } from './lib/api-client.js';
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ descriptorVersion: '1.0.0', format: 'round-robin' });
  });

  it('surfaces backend custom-script refusal verbatim', async () => {
    render(
      withIntl(
        <TournamentAuthoringPage
          organizationAlias="liga-mendocina"
          client={client({
            createTournament: async () => {
              throw new ControlApiError(
                400,
                'Action "stale-action" is not registered for event.recorded',
                'tournament-bad-request',
              );
            },
          })}
        />,
      ),
    );

    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Inválida' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-invalida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

    expect(
      await screen.findByText('Action "stale-action" is not registered for event.recorded'),
    ).toBeDefined();
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

  it('loads entrants needing an abbreviation and removes one from the list once set', async () => {
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

  it('registers a walk-up person through the direct-add dialog and shows the new row', async () => {
    const created: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createPerson: async (_organizationAlias, _tournamentAlias, request) => {
                created.push(request);
                return {
                  entrantId: 'e-3',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-3',
                  displayName: request.displayName,
                };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add participant' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Walk-up Person' } });
    fireEvent.change(screen.getByLabelText('Alias (optional)'), {
      target: { value: 'walk-up-alias' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    });

    expect(created).toEqual([{ displayName: 'Walk-up Person', alias: 'walk-up-alias' }]);
    expect(screen.getByText('Walk-up Person')).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Add participant' })).toBeNull();
  });

  it('registers a team through the direct-add dialog once its kind is selected', async () => {
    const created: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createTeam: async (_organizationAlias, _tournamentAlias, request) => {
                created.push(request);
                return { entrantId: 'e-4', tournamentId: 't-1', status: 'pending', teamId: 't-4' };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add participant' }));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'team' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Talleres' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    });

    expect(created).toEqual([{ name: 'Talleres' }]);
  });

  it('shows the refusal message from the direct-add dialog and keeps it open on failure', async () => {
    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              createPerson: async () => {
                throw new ControlApiError(
                  409,
                  'Another person already uses this alias',
                  'registration-conflict',
                );
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add participant' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Persona' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    });

    expect(await screen.findByText('Another person already uses this alias')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Add participant' })).toBeDefined();
  });

  it('cancels the direct-add dialog without calling the API', async () => {
    const onAdd = jest.fn<NonNullable<ControlApiClient['createPerson']>>();
    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({ createPerson: onAdd })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add participant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Add participant' })).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("edits a directly-added team's name from the per-row edit action", async () => {
    const updated: unknown[] = [];

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
              updateTeamIdentity: async (_organizationAlias, _tournamentAlias, teamId, request) => {
                updated.push({ teamId, request });
                return { teamId, name: request.name ?? '' };
              },
            })}
          />,
        ),
      );
    });

    const summary = screen.getByText('team-1').closest('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameField = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameField.value).toBe('team-1');
    fireEvent.change(nameField, { target: { value: 'Talleres FC' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(updated).toEqual([{ teamId: 'team-1', request: { name: 'Talleres FC' } }]);
    expect(screen.getByText('Talleres FC')).toBeDefined();
  });

  it("edits a directly-added person's display name from the per-row edit action", async () => {
    const updated: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                {
                  entrantId: 'e-1',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-1',
                  displayName: 'Mariano Otero',
                },
              ],
              updatePersonIdentity: async (
                _organizationAlias,
                _tournamentAlias,
                personId,
                request,
              ) => {
                updated.push({ personId, request });
                return { personId, displayName: request.displayName ?? '' };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByText('Mariano Otero'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameField = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: 'Mariano Otero (corrected)' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(updated).toEqual([
      { personId: 'person-1', request: { displayName: 'Mariano Otero (corrected)' } },
    ]);
    expect(screen.getByText('Mariano Otero (corrected)')).toBeDefined();
  });

  it('links a participant identity through the route and flips the row to unlink (openspec 0170)', async () => {
    const linked: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                {
                  entrantId: 'e-1',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-1',
                  displayName: 'Mariano Otero',
                },
                {
                  entrantId: 'e-2',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-2',
                  displayName: 'Otra Persona',
                },
              ],
              linkParticipantIdentity: async (_organizationAlias, personId, request) => {
                linked.push({ personId, request });
                return { principalId: 'principal-1', personId };
              },
            })}
          />,
        ),
      );
    });

    const marianoRow = screen.getByText('Mariano Otero').closest('details') as HTMLElement;
    fireEvent.click(within(marianoRow).getByText('Mariano Otero'));
    fireEvent.click(within(marianoRow).getByText('Link identity'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'mariano@example.test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    });

    expect(linked).toEqual([{ personId: 'person-1', request: { email: 'mariano@example.test' } }]);
    expect(within(marianoRow).getByRole('button', { name: 'Unlink' })).toBeDefined();
  });

  it('unlinks a participant identity through the route and flips the row back to linkable', async () => {
    const unlinked: unknown[] = [];

    await act(async () => {
      render(
        withIntl(
          <RegistrationReviewRoute
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            client={client({
              listRegistrations: async () => [
                {
                  entrantId: 'e-1',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-1',
                  displayName: 'Mariano Otero',
                  hasIdentityLink: true,
                },
                {
                  entrantId: 'e-2',
                  tournamentId: 't-1',
                  status: 'pending',
                  personId: 'person-2',
                  displayName: 'Otra Persona',
                },
              ],
              unlinkParticipantIdentity: async (_organizationAlias, personId) => {
                unlinked.push(personId);
                return { principalId: 'principal-1', personId };
              },
            })}
          />,
        ),
      );
    });

    fireEvent.click(screen.getByText('Mariano Otero'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    });

    expect(unlinked).toEqual(['person-1']);
    expect(screen.getAllByText('Link identity')).toHaveLength(2);
  });
});
