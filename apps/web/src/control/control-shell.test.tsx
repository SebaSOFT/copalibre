import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ControlShell } from './components/ControlShell.js';
import {
  MatchConsoleControlRoute,
  RegistrationReviewControlRoute,
  ReportReviewControlRoute,
  RolesPermissionsControlRoute,
  TournamentAuthoringControlRoute,
} from './components/ControlRoutes.js';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
} from './lib/api-client.js';
import { mutationFeedback } from './lib/mutation-feedback.js';
import { sampleDashboardData } from './lib/sample.js';
import { TournamentSetupWizard } from './components/TournamentSetupWizard.js';

/**
 * The shell, the routes and the wizard's later steps (0023).
 *
 * The model tests cover the decisions; these cover the wiring, which is where a
 * route that renders nothing or a select that sets the wrong field hides.
 */

const DISCIPLINES = [
  {
    descriptorId: 'd-football',
    version: '1.2.0',
    name: 'Fútbol 11',
    supportedFormats: ['single-elimination', 'round-robin'],
  },
  {
    descriptorId: 'd-swimming',
    version: '2.0.0',
    name: 'Natación',
    supportedFormats: ['placement'],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('the control shell', () => {
  it('links every section under the organization it is showing', () => {
    render(
      <ControlShell organizationAlias="liga-mendocina">
        <p>contenido</p>
      </ControlShell>,
    );

    expect(screen.getByRole('link', { name: 'Torneos' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments',
    );
    expect(screen.getByText('contenido')).toBeDefined();
  });

  it('marks the active section, and only that one', () => {
    render(
      <ControlShell active="Panel" organizationAlias="liga-mendocina">
        <p>x</p>
      </ControlShell>,
    );

    // Two links styled the same is a sidebar that says nothing about where you
    // are.
    const active = screen.getByRole('link', { name: 'Panel' });
    const other = screen.getByRole('link', { name: 'Torneos' });
    expect(active.getAttribute('style')).not.toBe(other.getAttribute('style'));
  });
});

describe('the control routes', () => {
  it('renders the authoring page inside the shell', () => {
    render(<TournamentAuthoringControlRoute organizationAlias="liga-mendocina" />);

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeDefined();
    expect(screen.getAllByText(/Torneo/i).length).toBeGreaterThan(0);
  });

  it('renders the review route inside the shell', () => {
    render(
      <RegistrationReviewControlRoute
        now="2026-08-01T12:00:00.000Z"
        organizationAlias="liga-mendocina"
        tournamentAlias="apertura-2026"
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeDefined();
  });

  it('renders the report review route inside the shell', async () => {
    const client: ControlApiClient = minimalControlClient({
      listPendingReports: async () => [],
    });
    render(
      <ReportReviewControlRoute
        client={client}
        organizationAlias="liga-mendocina"
        tournamentAlias="apertura-2026"
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeDefined();
    await screen.findByText('No hay reportes ni disputas pendientes.');
  });

  it('renders the roles and permissions route inside the shell', async () => {
    const client: ControlApiClient = minimalControlClient({
      listOrganizationRoles: async () => [],
    });
    render(<RolesPermissionsControlRoute client={client} organizationAlias="liga-mendocina" />);

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeDefined();
    await waitFor(() => expect(screen.queryByText(/Cargando/)).toBeNull());
  });

  it('renders the match console route inside the shell', async () => {
    const projection: MatchConsoleResponse = {
      matchId: 'match-1',
      status: 'scheduled',
      result: null,
      liveScores: [],
      segments: [],
      runningTimers: [],
      events: [],
      eventDefinitions: [],
      eligiblePersonIds: [],
      eligibleStaffIds: [],
      entrantIds: [],
      capabilities: [],
      projectionVersion: 1,
    };
    const client: MatchConsoleApiClient = {
      fetchMatchConsole: async () => projection,
      adjustMatchClock: async () => projection,
      resolveMatchTimer: async () => projection,
      recordMatchEvent: async () => {
        throw new Error('not used in this test');
      },
      finalizeMatch: async () => {
        throw new Error('not used in this test');
      },
    };
    render(
      <MatchConsoleControlRoute
        client={client}
        matchId="match-1"
        organizationAlias="liga-mendocina"
        tournamentAlias="apertura-2026"
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeDefined();
    await screen.findByRole('region', { name: 'Operar partido' });
  });
});

function minimalControlClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
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
    fetchSeeding: async () => ({
      stageId: 'stage',
      format: 'single-elimination',
      seeds: [],
      matches: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({
      mutationClass: 'safe',
      reason: 'test',
      invalidates: [],
      persisted: true,
    }),
    listOrganizationRoles: async () => [],
    inviteOrganizationUser: async () => ({ invitationId: 'invite', expiresAt: '2099-01-01' }),
    changeOrganizationRole: async () => {
      throw new Error('not used in this test');
    },
    deleteOrganizationRole: async () => undefined,
    ...overrides,
  };
}

describe('the wizard beyond the first step', () => {
  it('carries the chosen discipline’s version and resets the format with it', () => {
    render(<TournamentSetupWizard disciplines={DISCIPLINES} onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));

    fireEvent.change(screen.getByLabelText('Disciplina'), { target: { value: 'd-swimming' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));

    // Changing the discipline must not carry the previous discipline's format
    // through — the API rejects it, and the operator would not know why.
    expect(screen.getByLabelText('Formato')).toHaveProperty('value', 'placement');
  });

  it('goes back without losing what was typed', () => {
    render(<TournamentSetupWizard disciplines={DISCIPLINES} onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Volver/i }));

    expect(screen.getByLabelText('Nombre')).toHaveProperty('value', 'Copa Verano');
  });

  it('submits the window toggles the check-in lock later reads', async () => {
    const submitted: unknown[] = [];
    render(
      <TournamentSetupWizard
        disciplines={DISCIPLINES}
        onSubmit={(request) => void submitted.push(request)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));

    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '16' } });
    fireEvent.click(screen.getByLabelText(/Requiere check-in/i));
    fireEvent.click(screen.getByRole('button', { name: /Crear/i }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toMatchObject({
      alias: 'copa-verano',
      descriptorVersion: '1.2.0',
      requiresCheckIn: true,
    });
  });
});

describe('the API client', () => {
  it('sends the token as a header and never in the URL', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = createControlApiClient({
      accessToken: () => 'secret-token',
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return jsonResponse([]);
      }) as unknown as typeof fetch,
    });

    await client.listRegistrations('liga-mendocina', 'apertura-2026', 'pending');

    expect(calls[0]?.url).toContain('status=pending');
    expect(calls[0]?.url).not.toContain('secret-token');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer secret-token');
  });

  it('reports the server’s reason, not just the status', async () => {
    // A 409 here says "check-in has closed…"; a number tells the operator
    // nothing they can act on.
    const client = createControlApiClient({
      fetch: (async () =>
        jsonResponse(
          { message: 'Check-in has closed for this entrant' },
          409,
        )) as unknown as typeof fetch,
    });

    await expect(
      client.reviewRegistration('liga', 'apertura', 'e-1', { decision: 'accepted' }),
    ).rejects.toThrow('Check-in has closed');
  });

  it('reports the first message when the API sends a list of them', async () => {
    const client = createControlApiClient({
      fetch: (async () =>
        jsonResponse({ message: ['El alias va en minúscula'] }, 400)) as unknown as typeof fetch,
    });

    await expect(client.listDisciplines()).rejects.toThrow('El alias va en minúscula');
  });

  it('falls back to the status when the body explains nothing', async () => {
    const client = createControlApiClient({
      fetch: (async () =>
        new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch,
    });

    await expect(client.listDisciplines()).rejects.toThrow('502');
  });

  it('carries the status on the error, so a caller can tell 409 from 500', async () => {
    const client = createControlApiClient({
      fetch: (async () => jsonResponse({ message: 'conflicto' }, 409)) as unknown as typeof fetch,
    });

    await client.listDisciplines().catch((error: unknown) => {
      expect(error).toBeInstanceOf(ControlApiError);
      expect((error as ControlApiError).status).toBe(409);
    });
  });

  it('creates a tournament with the wizard’s body', async () => {
    const bodies: unknown[] = [];
    const client = createControlApiClient({
      fetch: (async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ tournamentId: 't-1', alias: 'copa', name: 'Copa' });
      }) as unknown as typeof fetch,
    });

    await client.createTournament('liga', {
      alias: 'copa',
      name: 'Copa',
      descriptorId: 'd-1',
      descriptorVersion: '1.0.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: false,
    });

    expect(bodies[0]).toMatchObject({ descriptorVersion: '1.0.0', format: 'round-robin' });
  });

  it('reviews one registration through its own endpoint', async () => {
    const urls: string[] = [];
    const client = createControlApiClient({
      fetch: (async (url: string) => {
        urls.push(url);
        return jsonResponse({ entrantId: 'e-1', tournamentId: 't-1', status: 'accepted' });
      }) as unknown as typeof fetch,
    });

    await client.reviewRegistration('liga', 'apertura', 'e-1', { decision: 'accepted' });

    expect(urls[0]).toContain('/registrations/e-1/review');
  });
});

describe('mutation feedback', () => {
  it('blocks only once results exist', () => {
    expect(
      mutationFeedback({ mutationClass: 'blocked_after_results', hasRecordedResults: true }).kind,
    ).toBe('blocked');
    // Before any result the same edit is ordinary authoring.
    expect(
      mutationFeedback({ mutationClass: 'blocked_after_results', hasRecordedResults: false }).kind,
    ).toBe('none');
  });

  it('warns with a count when a rebuild is required', () => {
    const counted = mutationFeedback({
      mutationClass: 'requires_rebuild',
      hasRecordedResults: false,
      invalidatedFixtureCount: 1,
    });
    const uncounted = mutationFeedback({
      mutationClass: 'requires_rebuild',
      hasRecordedResults: false,
    });

    expect(counted.kind).toBe('warning');
    expect(uncounted.kind).toBe('warning');
    if (counted.kind === 'none' || uncounted.kind === 'none') return;
    expect(counted.message).toContain('1 fixture');
    expect(uncounted.message).toContain('regenerar estructura');
  });

  it('says nothing about a safe change', () => {
    expect(mutationFeedback({ mutationClass: 'safe', hasRecordedResults: true })).toEqual({
      kind: 'none',
    });
  });
});

describe('the sample data', () => {
  it('describes one organization', () => {
    const sample = sampleDashboardData();

    expect(sample.tournaments.every((one) => one.organizationId === sample.organizationId)).toBe(
      true,
    );
  });
});
