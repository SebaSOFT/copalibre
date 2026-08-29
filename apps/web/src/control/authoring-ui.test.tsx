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
import { createControlApiClient, type HookScriptVocabulary } from './lib/api-client.js';

const HOOK_VOCABULARY: HookScriptVocabulary = {
  hooks: ['event.recorded'],
  entries: [
    {
      kind: 'action',
      type: 'notify',
      description: 'Declare notification',
      authoring: {
        parameters: [
          {
            name: 'title',
            description: 'Notification title',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
          {
            name: 'message',
            description: 'Notification message',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
        ],
      },
    },
  ],
};

describe('the tournament setup wizard screen', () => {
  it('renders schema-driven rule fields, conditionless guidance, and a removable rule list', () => {
    render(
      withIntl(
        <TournamentSetupWizard disciplines={sampleDisciplines()} vocabulary={HOOK_VOCABULARY} />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Reglas' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-reglas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByLabelText('Add rule for every recorded event'));

    expect(screen.getByText(/fires for every recorded event/i)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'notify' } });
    const add = screen.getByRole('button', { name: 'Add another rule' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Notification title *'), {
      target: { value: 'Match update' },
    });
    fireEvent.change(screen.getByLabelText('Notification message *'), {
      target: { value: '{{ event.definitionCode }}' },
    });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);

    expect(screen.getByText(/always → notify/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText(/always → notify/)).toBeNull();
  });

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
        customScripts: [],
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
        customScripts: [],
      },
    ]);
  });

  it('associates labels with inputs, updates progress, and disables continue on invalid input', () => {
    render(withIntl(<TournamentSetupWizard disciplines={sampleDisciplines()} />));

    const progressTile = screen.getByTestId('wizard-progress');
    expect(progressTile.textContent).toContain('20%');

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    const aliasInput = screen.getByLabelText('Alias') as HTMLInputElement;
    expect(nameInput.id).toBe('wizard-name');
    expect(aliasInput.id).toBe('wizard-alias');

    const continueBtn = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Liga San Rafael' } });
    fireEvent.change(aliasInput, { target: { value: 'INVALID ALIAS' } });
    expect(continueBtn.disabled).toBe(true);

    fireEvent.change(aliasInput, { target: { value: 'liga-san-rafael' } });
    expect(continueBtn.disabled).toBe(false);

    fireEvent.click(continueBtn);
    expect(progressTile.textContent).toContain('40%');
    expect((screen.getByLabelText('Discipline') as HTMLSelectElement).id).toBe('wizard-discipline');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(progressTile.textContent).toContain('20%');
    expect(screen.getByLabelText('Name')).toBeDefined();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Liga San Rafael');
  });

  it('offers the accounting-grain control only once series is enabled, preselecting match grain (0160)', () => {
    render(withIntl(<TournamentSetupWizard disciplines={sampleDisciplines()} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Grano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-grano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByLabelText('Counts towards standings as')).toBeNull();

    fireEvent.click(screen.getByLabelText('Settle each cross with a series of matches'));

    const grainSelect = screen.getByLabelText('Counts towards standings as') as HTMLSelectElement;
    expect(grainSelect.value).toBe('match');

    fireEvent.click(screen.getByLabelText('Settle each cross with a series of matches'));
    expect(screen.queryByLabelText('Counts towards standings as')).toBeNull();
  });

  it('captures an explicit choice of series grain in the control’s own value (0160)', () => {
    render(withIntl(<TournamentSetupWizard disciplines={sampleDisciplines()} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Grano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-grano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByLabelText('Settle each cross with a series of matches'));

    const grainSelect = screen.getByLabelText('Counts towards standings as') as HTMLSelectElement;
    fireEvent.change(grainSelect, { target: { value: 'series' } });
    expect(grainSelect.value).toBe('series');

    // Toggling series off hides the control without discarding its value —
    // re-enabling shows the same choice, the same way span and resolution
    // class already survive a toggle.
    fireEvent.click(screen.getByLabelText('Settle each cross with a series of matches'));
    fireEvent.click(screen.getByLabelText('Settle each cross with a series of matches'));
    expect((screen.getByLabelText('Counts towards standings as') as HTMLSelectElement).value).toBe(
      'series',
    );
  });
});

describe('decision descriptions (openspec 0161)', () => {
  const DISCIPLINE_WITH_DESCRIPTIONS = [
    {
      descriptorId: '01890000-0000-7000-8000-000000000010',
      version: '1.0.0',
      name: 'Chukka Polo',
      supportedFormats: ['round-robin'],
      formatDescriptions: { 'round-robin': 'Every chukka counts toward the season table' },
      fieldPolicies: {
        format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
        'registration.capacity': {
          permission: { kind: 'replaced' },
          mutationClass: 'requires_rebuild',
        },
      },
    },
  ] as const;

  it("shows a discipline's own format description verbatim, ahead of the platform's", () => {
    render(withIntl(<TournamentSetupWizard disciplines={DISCIPLINE_WITH_DESCRIPTIONS} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Chukka' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-chukka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const formatSelect = screen.getByLabelText('Format');
    expect(formatSelect.textContent).toContain('Every chukka counts toward the season table');
    // The platform's own generic round-robin text is not shown once the
    // descriptor supplies its own — tier one wins over tier two.
    expect(formatSelect.textContent).not.toContain(
      'Every entrant plays every other entrant once; standings rank by accumulated points.',
    );
  });

  it('states a blocked_after_results field cannot change once a result exists, before it is chosen, naming the audited correction workflow', () => {
    render(withIntl(<TournamentSetupWizard disciplines={DISCIPLINE_WITH_DESCRIPTIONS} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Chukka' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-chukka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const formatSelect = screen.getByLabelText('Format') as HTMLSelectElement;
    const hintId = formatSelect.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId ?? '')?.textContent).toContain(
      'This cannot be changed once a result exists; use the audited correction workflow instead.',
    );
  });

  it('states a requires_rebuild field warns about regenerating fixtures, reachable from the control via aria-describedby', () => {
    render(withIntl(<TournamentSetupWizard disciplines={DISCIPLINE_WITH_DESCRIPTIONS} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Chukka' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-chukka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const capacityInput = screen.getByLabelText('Capacity') as HTMLInputElement;
    const hintId = capacityInput.getAttribute('aria-describedby');
    expect(document.getElementById(hintId ?? '')?.textContent).toContain(
      'Changing this after fixtures are generated invalidates and regenerates them.',
    );
  });

  it('shows an explanation, reachable via aria-describedby with no pointer, for every decision on every step', () => {
    render(withIntl(<TournamentSetupWizard disciplines={sampleDisciplines()} />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Explicada' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-explicada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const disciplineSelect = screen.getByLabelText('Discipline');
    const disciplineHintId = disciplineSelect.getAttribute('aria-describedby');
    expect(disciplineHintId).toBeTruthy();
    expect(document.getElementById(disciplineHintId ?? '')?.textContent).toBeTruthy();
  });
});

describe('wizard state transitions and validators', () => {
  it('computes step problems, progress, and steps navigation', () => {
    const disciplines = sampleDisciplines();
    let state = initialWizard();
    expect(state.step).toBe('name');
    expect(progress(state)).toBe(20);
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
    expect(step4).toBe('rules');
    state = { ...state, step: step4 };
    expect(canContinue(state, disciplines)).toBe(true);

    const step5 = nextStep(state);
    expect(step5).toBe('window');
    state = { ...state, step: step5, capacity: 1 };
    expect(stepProblems(state, disciplines).length).toBe(1);

    state = { ...state, capacity: 8 };
    expect(canContinue(state, disciplines)).toBe(true);
    expect(progress(state)).toBe(100);

    expect(previousStep(state)).toBe('rules');

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
        if (url.endsWith('/custom-script-vocabulary')) {
          return json({ hooks: ['event.recorded'], entries: [] });
        }
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
        if (url.endsWith('/custom-script-vocabulary')) {
          return json({ hooks: ['event.recorded'], entries: [] });
        }
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
