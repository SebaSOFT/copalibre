import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RegistrationReviewPage } from './components/RegistrationReviewPage.js';
import { TournamentSetupWizard } from './components/TournamentSetupWizard.js';
import { sampleDisciplines, sampleRegistrations } from './lib/sample.js';
import { withIntl } from './i18n/test-support.js';
import {
  canContinue,
  initialWizard,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toCreateRequest,
} from './lib/wizard.js';
import { createControlApiClient } from './lib/api-client.js';

describe('the tournament setup wizard screen', () => {
  it('gates progression and submits the descriptor version', () => {
    const submitted: unknown[] = [];
    render(
      withIntl(
        <TournamentSetupWizard
          disciplines={sampleDisciplines()}
          onSubmit={(request) => submitted.push(request)}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Discipline').textContent).toContain('Football');
    expect(screen.getByLabelText('Discipline').textContent).toContain(
      'Team discipline with timed halves and goal-based scoring',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Format').textContent).toContain('single-elimination');
    expect(screen.getByLabelText('Format').textContent).not.toContain('placement');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

    expect(submitted).toEqual([
      {
        alias: 'copa-verano',
        name: 'Copa Verano',
        descriptorId: '01890000-0000-7000-8000-000000000001',
        descriptorVersion: '1.2.0',
        format: 'single-elimination',
        publicRegistration: false,
        requiresCheckIn: false,
      },
    ]);
  });

  it('submits region, capacity, check-in deadline, and selected profile preset', () => {
    const submitted: unknown[] = [];
    const profiles = [
      {
        profileId: '01890000-0000-7000-8000-000000000099',
        alias: 'grupos-y-playoff',
        version: '1.0.0',
        name: 'Groups and playoff',
        stages: [
          { number: 1, name: 'Groups', format: 'round-robin' },
          { number: 2, name: 'Playoff', format: 'single-elimination' },
        ],
      },
    ];

    render(
      withIntl(
        <TournamentSetupWizard
          disciplines={sampleDisciplines()}
          profiles={profiles}
          onSubmit={(request) => submitted.push(request)}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Torneo Apertura' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'torneo-apertura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Competition Profile')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Competition Profile'), {
      target: { value: '01890000-0000-7000-8000-000000000099' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Cuyo' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '16' } });
    fireEvent.click(screen.getByLabelText('Requires check-in'));
    fireEvent.change(screen.getByLabelText('Check-in Deadline'), {
      target: { value: '2026-09-01T12:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

    expect(submitted).toEqual([
      {
        alias: 'torneo-apertura',
        name: 'Torneo Apertura',
        descriptorId: '01890000-0000-7000-8000-000000000001',
        descriptorVersion: '1.2.0',
        format: 'single-elimination',
        publicRegistration: false,
        requiresCheckIn: true,
        region: 'Cuyo',
        capacity: 16,
        checkInClosesAt: '2026-09-01T12:00',
        profileId: '01890000-0000-7000-8000-000000000099',
        profileVersion: '1.0.0',
      },
    ]);
  });
});

describe('wizard state transitions and validators', () => {
  it('computes step problems, progress, and steps navigation', () => {
    const disciplines = sampleDisciplines();
    let state = initialWizard();
    expect(state.step).toBe('name');
    expect(progress(state)).toBe(25);
    expect(canContinue(state, disciplines)).toBe(false);
    expect(stepProblems(state, disciplines).length).toBeGreaterThan(0);

    state = { ...state, name: 'Test Cup', alias: 'invalid_alias' };
    expect(stepProblems(state, disciplines).length).toBeGreaterThan(0);

    state = { ...state, alias: 'test-cup' };
    expect(canContinue(state, disciplines)).toBe(true);

    const step2 = nextStep(state);
    expect(step2).toBe('discipline');
    state = { ...state, step: step2 };
    expect(stepProblems(state, disciplines).length).toBe(1);

    state = {
      ...state,
      descriptorId: disciplines[0]?.descriptorId,
      descriptorVersion: disciplines[0]?.version,
    };
    expect(canContinue(state, disciplines)).toBe(true);

    const step3 = nextStep(state);
    expect(step3).toBe('format');
    state = { ...state, step: step3, format: 'invalid-format' };
    expect(stepProblems(state, disciplines).length).toBe(1);

    state = { ...state, format: 'round-robin' };
    expect(canContinue(state, disciplines)).toBe(true);

    const step4 = nextStep(state);
    expect(step4).toBe('window');
    state = { ...state, step: step4, capacity: 1 };
    expect(stepProblems(state, disciplines).length).toBe(1);

    state = { ...state, capacity: 8 };
    expect(canContinue(state, disciplines)).toBe(true);
    expect(progress(state)).toBe(100);

    expect(previousStep(state)).toBe('format');

    expect(() => toCreateRequest(initialWizard())).toThrow('The wizard is not complete');

    const request = toCreateRequest(state);
    expect(request.name).toBe('Test Cup');
    expect(request.capacity).toBe(8);
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TournamentAuthoringPage component', () => {
  it('renders loading, empty, and creation failure states gracefully', async () => {
    const { TournamentAuthoringPage } = await import('./components/TournamentAuthoringPage.js');
    const mockClient = createControlApiClient({
      fetch: async (input) => {
        const url = String(input);
        if (url === '/disciplines') return json([]);
        return new Response('Not found', { status: 404 });
      },
      accessToken: () => undefined,
    });

    const { rerender } = render(
      withIntl(<TournamentAuthoringPage organizationAlias="liga-mendocina" client={mockClient} />),
    );

    expect(await screen.findByText(/No disciplines are installed/i)).toBeDefined();

    const failedClient = createControlApiClient({
      fetch: async () => {
        throw new Error('network error');
      },
      accessToken: () => undefined,
    });

    rerender(
      withIntl(
        <TournamentAuthoringPage organizationAlias="liga-mendocina" client={failedClient} />,
      ),
    );

    expect(await screen.findByText(/Could not load the disciplines/i)).toBeDefined();
  });

  it('submits a new tournament through the authoring page', async () => {
    const { TournamentAuthoringPage } = await import('./components/TournamentAuthoringPage.js');
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = createControlApiClient({
      fetch: async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        if (url === '/disciplines') return json(sampleDisciplines());
        if (url.startsWith('/tournament-profiles/compatible')) return json([]);
        if (url === '/organizations/liga-mendocina/tournaments') {
          return json(
            {
              tournamentId: 't-1',
              alias: (body as { alias: string }).alias,
              name: (body as { name: string }).name,
            },
            201,
          );
        }
        return new Response('Not found', { status: 404 });
      },
      accessToken: () => undefined,
    });

    render(
      withIntl(<TournamentAuthoringPage organizationAlias="liga-mendocina" client={client} />),
    );

    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Liga A' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'liga-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

    await waitFor(() => {
      expect(screen.getByText(/Tournament created: liga-a/i)).toBeDefined();
    });
    expect(calls.some((c) => c.url === '/organizations/liga-mendocina/tournaments')).toBe(true);
  });
});

describe('the registration review screen', () => {
  it('filters rows, selects visible rows and exposes row details', () => {
    render(
      withIntl(
        <RegistrationReviewPage
          organizationAlias="liga-mendocina"
          tournamentName="apertura-2026"
          rows={sampleRegistrations()}
          now="2026-08-01T17:00:00.000Z"
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
    expect(screen.getByText('Talleres Azul')).toBeDefined();
    expect(screen.queryByText('Casa de Italia')).toBeNull();

    fireEvent.click(screen.getByLabelText('Select visible'));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByText('Talleres Azul'));
    expect(screen.getByText('delegado@talleres.test')).toBeDefined();
  });

  it('shows the check-in team-membership lock when the server would reject the edit', () => {
    render(
      withIntl(
        <RegistrationReviewPage
          organizationAlias="liga-mendocina"
          tournamentName="apertura-2026"
          rows={sampleRegistrations()}
          now="2026-08-01T19:00:00.000Z"
        />,
      ),
    );

    fireEvent.click(screen.getByText('San Martín'));

    expect(screen.getByText(/Check-in closed/)).toBeDefined();
    expect(
      screen
        .getAllByRole('button', { name: 'Edit members' })
        .some((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
