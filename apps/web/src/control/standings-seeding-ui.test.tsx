import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type TableLayoutSummaryResponse,
  type TableProjectionResponseData,
} from './lib/api-client.js';
import type { CanvasMatch } from './lib/bracket-canvas.js';
import { SeedingControlRoute, StandingsControlRoute } from './components/ControlRoutes.js';
import { SeedingBuilderPage } from './components/SeedingBuilderPage.js';
import { withIntl } from './i18n/test-support.js';

const groupPhaseLayout: TableLayoutSummaryResponse = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  entityGranularity: 'team',
};

const projection: TableProjectionResponseData = {
  layoutCode: groupPhaseLayout.code,
  target: groupPhaseLayout.target,
  label: groupPhaseLayout.label,
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'points', header: 'Points', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: [
    {
      actorId: 'tll',
      entrantId: 'tll',
      rank: 1,
      sharedRank: false,
      cells: { name: { raw: 'tll', formatted: 'tll' }, points: { raw: 6, formatted: '6' } },
    },
    {
      actorId: 'ind',
      entrantId: 'ind',
      rank: 2,
      sharedRank: true,
      cells: { name: { raw: 'ind', formatted: 'ind' }, points: { raw: 3, formatted: '3' } },
    },
  ],
  projectionVersion: 7,
};

const matches: readonly CanvasMatch[] = [
  {
    matchId: 'WB-R1-M1',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'finalized',
    format: 'BO3',
    slots: [
      { kind: 'entrant', entrantId: 'tll', score: 2 },
      { kind: 'entrant', entrantId: 'ind', score: 1 },
    ],
  },
  {
    matchId: 'WB-R2-M1',
    bracket: 'winners',
    round: 2,
    position: 1,
    status: 'scheduled',
    slots: [{ kind: 'winner-of', matchId: 'WB-R1-M1' }, { kind: 'bye' }],
  },
];

function openRow(entrantId: string): HTMLDetailsElement {
  const row = screen
    .getAllByText(entrantId)
    .map((node) => node.closest('details'))
    .find((node): node is HTMLDetailsElement => node !== null) as HTMLDetailsElement;
  row.open = true;
  fireEvent(row, new Event('toggle'));
  return row;
}

describe('SeedingBuilderPage', () => {
  const seeds = [
    { seed: 1, entrantId: 'tll', locked: false },
    { seed: 2, entrantId: 'ind', locked: false },
  ];

  it('locks a seed and keeps it through a randomize', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={matches}
          organizationAlias="liga-mendocina"
          random={() => 0.99}
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lock seed 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle unlocked' }));

    const rows = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(rows[0]).toContain('tll');
  });

  it('undoes and redoes a change', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={matches}
          organizationAlias="liga-mendocina"
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Lock seed 2' }));
    expect(screen.getByRole('button', { name: 'Release seed 2' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Lock seed 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByRole('button', { name: 'Release seed 2' })).toBeTruthy();
  });

  it('blocks every seeding action once a result exists, and explains why', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults
          matches={matches}
          organizationAlias="liga-mendocina"
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByRole('alert').textContent).toContain('audited correction flow');
    expect(screen.getByRole('button', { name: 'Shuffle unlocked' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Publish seeding' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('publishes only an order that actually changed', () => {
    const onPublish = jest.fn();
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={matches}
          onPublish={onPublish as unknown as (next: readonly (typeof seeds)[number][]) => void}
          organizationAlias="liga-mendocina"
          random={() => 0}
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByRole('button', { name: 'Publish seeding' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle unlocked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish seeding' }));
    expect(onPublish).toHaveBeenCalled();
  });

  it('names an unresolved slot and shows the format badge', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={matches}
          organizationAlias="liga-mendocina"
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    // describeSlot (lib/bracket-canvas.ts) is not yet extracted (0053, documented
    // follow-up) — its dynamic match-ID interpolation stays Spanish regardless of locale.
    expect(screen.getByText('TBD · Ganador del WB-R1-M1')).toBeTruthy();
    expect(screen.getByText('BO3')).toBeTruthy();
  });

  it('zooms the canvas through the declared stops', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={matches}
          organizationAlias="liga-mendocina"
          seeds={seeds}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('says a stage has no structure rather than drawing an empty frame', () => {
    render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={[]}
          organizationAlias="liga-mendocina"
          seeds={[]}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText(/No structure has been generated/)).toBeTruthy();
    expect(screen.getByText('This stage has no participants.')).toBeTruthy();
  });
});

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listMyOrganizations: () => Promise.resolve([]),
    listDisciplines: () => Promise.resolve([]),
    createTournament: () => Promise.reject(new Error('not used')),
    listRegistrations: () => Promise.resolve([]),
    bulkReview: () => Promise.reject(new Error('not used')),
    reviewRegistration: () => Promise.reject(new Error('not used')),
    fetchStandings: () => Promise.reject(new Error('not used')),
    fetchTiebreakTrace: () => Promise.resolve({ entrantId: 'ind', lines: ['linea'] }),
    fetchTableLayouts: () => Promise.resolve([groupPhaseLayout]),
    fetchTableProjection: () => Promise.resolve(projection),
    fetchSeeding: () =>
      Promise.resolve({
        stageId: 'stage-1',
        format: 'single-elimination',
        seeds: [{ seed: 1, entrantId: 'tll' }],
        matches,
        hasRecordedResults: false,
      }),
    publishSeeding: () =>
      Promise.resolve({
        mutationClass: 'safe',
        reason: 'Sin fixtures generados',
        invalidates: [],
        persisted: true,
      }),
    listOrganizationRoles: () => Promise.resolve([]),
    inviteOrganizationUser: () =>
      Promise.resolve({ invitationId: 'invite-1', expiresAt: '2099-01-01T00:00:00.000Z' }),
    changeOrganizationRole: () =>
      Promise.resolve({
        assignmentId: 'assignment-1',
        principalId: 'principal-1',
        email: 'user@example.test',
        role: 'viewer' as const,
        status: 'active' as const,
      }),
    deleteOrganizationRole: () => Promise.resolve(),
    ...overrides,
  };
}

describe('control routes', () => {
  it('loads standings and expands a row through the API client', async () => {
    render(
      <StandingsControlRoute
        client={stubClient({})}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Posiciones');
    // Both the distribution chart's bar label and the table row repeat the
    // entrant name; either is proof the projection loaded.
    await screen.findAllByText('ind');
    openRow('ind');
    expect(await screen.findByText('linea')).toBeTruthy();
  });

  it('reports a standings load it could not complete', async () => {
    render(
      <StandingsControlRoute
        client={stubClient({ fetchTableProjection: () => Promise.reject(new Error('down')) })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    expect(await screen.findByText('No se pudieron cargar las posiciones.')).toBeTruthy();
  });

  it('reports a table-layout list it could not complete', async () => {
    render(
      <StandingsControlRoute
        client={stubClient({ fetchTableLayouts: () => Promise.reject(new Error('down')) })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    expect(await screen.findByText('No se pudieron cargar las tablas.')).toBeTruthy();
  });

  it('offers a group selector for a stage with more than one group and scopes the table to the selected one (0108)', async () => {
    const zones: readonly {
      readonly zoneId: string;
      readonly stageId: string;
      readonly number: number;
      readonly name: string;
    }[] = [{ zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zona 1' }];
    const groups: readonly {
      readonly groupId: string;
      readonly zoneId: string;
      readonly number: number;
      readonly name: string;
    }[] = [
      { groupId: 'group-a', zoneId: 'zone-1', number: 1, name: 'Grupo A' },
      { groupId: 'group-b', zoneId: 'zone-1', number: 2, name: 'Grupo B' },
    ];
    const projectionRequests: unknown[] = [];
    render(
      <StandingsControlRoute
        client={stubClient({
          listZones: () => Promise.resolve(zones),
          listGroups: () => Promise.resolve(groups),
          fetchTableProjection: (_org, _tournament, _layoutCode, scope) => {
            projectionRequests.push(scope);
            return Promise.resolve(projection);
          },
        })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    const selector = await screen.findByRole('combobox', { name: 'Grupo' });
    expect(screen.getByRole('option', { name: 'Grupo A' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Grupo B' })).toBeTruthy();

    await act(async () => {
      fireEvent.change(selector, { target: { value: 'group-b' } });
    });

    expect(projectionRequests).toContainEqual({ stageNumber: 1, groupId: 'group-b' });
  });

  it('shows no group selector for a single-implicit-group stage (0108)', async () => {
    render(
      <StandingsControlRoute
        client={stubClient({
          listZones: () =>
            Promise.resolve([{ zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zona 1' }]),
          listGroups: () =>
            Promise.resolve([{ groupId: 'group-1', zoneId: 'zone-1', number: 1, name: 'Grupo 1' }]),
        })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    await screen.findAllByText('ind');
    expect(screen.queryByRole('combobox', { name: 'Grupo' })).toBeNull();
  });

  it('shows the server’s own refusal when a reseed is blocked', async () => {
    render(
      <SeedingControlRoute
        client={stubClient({
          fetchSeeding: () =>
            Promise.resolve({
              stageId: 'stage-1',
              format: 'single-elimination',
              seeds: [
                { seed: 1, entrantId: 'tll' },
                { seed: 2, entrantId: 'ind' },
              ],
              matches,
              hasRecordedResults: false,
            }),
          publishSeeding: () =>
            Promise.reject(new ControlApiError(409, 'Seeding cannot change once a result exists')),
        })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Sembrado');
    // Pinned so the shuffle is a real change every run: with two entrants an
    // unpinned Math.random leaves the order alone half the time.
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sortear no fijados' }));
    random.mockRestore();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar sembrado' }));
    });

    expect(screen.getByRole('alert').textContent).toContain('once a result exists');
  });

  it('confirms persistence and refreshes the bracket after a successful publish', async () => {
    const fetchSeeding = jest
      .fn<ControlApiClient['fetchSeeding']>()
      .mockResolvedValueOnce({
        stageId: 'stage-1',
        format: 'single-elimination',
        seeds: [
          { seed: 1, entrantId: 'tll' },
          { seed: 2, entrantId: 'ind' },
        ],
        matches,
        hasRecordedResults: false,
      })
      .mockResolvedValueOnce({
        stageId: 'stage-1',
        format: 'single-elimination',
        seeds: [
          { seed: 1, entrantId: 'ind' },
          { seed: 2, entrantId: 'tll' },
        ],
        matches,
        hasRecordedResults: false,
      });

    render(
      <SeedingControlRoute
        client={stubClient({
          fetchSeeding,
          publishSeeding: () =>
            Promise.resolve({
              mutationClass: 'safe',
              reason: 'Sin fixtures generados',
              invalidates: [],
              persisted: true,
            }),
        })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Sembrado');
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sortear no fijados' }));
    random.mockRestore();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar sembrado' }));
    });

    expect((await screen.findByRole('status')).textContent).toContain('Sin fixtures generados');
    // Once on load, once to refresh after the confirmed publish.
    expect(fetchSeeding).toHaveBeenCalledTimes(2);
  });

  it('reports a seeding load it could not complete', async () => {
    render(
      <SeedingControlRoute
        client={stubClient({ fetchSeeding: () => Promise.reject(new Error('down')) })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    expect(await screen.findByText('No se pudo cargar el sembrado.')).toBeTruthy();
  });

  it('pre-fills from a resolved promotion plan when the stage has no seeds yet (0121)', async () => {
    render(
      <SeedingControlRoute
        client={stubClient({
          fetchSeeding: () =>
            Promise.resolve({
              stageId: 'stage-2',
              format: 'single-elimination',
              seeds: [],
              matches: [],
              hasRecordedResults: false,
            }),
          fetchPromotionPlansTargetingStage: () =>
            Promise.resolve([
              {
                zoneNumber: 1,
                zoneId: 'zone-1',
                combined: [
                  { entrantId: 'tll', groupId: 'group-1', rank: 1 },
                  { entrantId: 'ind', groupId: 'group-2', rank: 1 },
                ],
              },
            ]),
        })}
        organizationAlias="liga-mendocina"
        stageNumber={2}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Sembrado');
    const seedList = screen.getByRole('list', { name: 'Orden de siembra' });
    const rows = within(seedList)
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toEqual([expect.stringContaining('tll'), expect.stringContaining('ind')]);
  });

  it('does not override an already-recorded seed order with a matching promotion plan (0121)', async () => {
    const fetchPromotionPlansTargetingStage =
      jest.fn<NonNullable<ControlApiClient['fetchPromotionPlansTargetingStage']>>();
    render(
      <SeedingControlRoute
        client={stubClient({
          fetchSeeding: () =>
            Promise.resolve({
              stageId: 'stage-2',
              format: 'single-elimination',
              seeds: [{ seed: 1, entrantId: 'tll' }],
              matches,
              hasRecordedResults: false,
            }),
          fetchPromotionPlansTargetingStage,
        })}
        organizationAlias="liga-mendocina"
        stageNumber={2}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Sembrado');
    const seedList = screen.getByRole('list', { name: 'Orden de siembra' });
    expect(
      within(seedList)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('tll')]);
    // Existing seeds are the API's own signal not to look further — the
    // reverse lookup is never even called (design.md: no override, ever).
    expect(fetchPromotionPlansTargetingStage).not.toHaveBeenCalled();
  });

  it('starts empty when no promotion plan targets the stage (0121)', async () => {
    render(
      <SeedingControlRoute
        client={stubClient({
          fetchSeeding: () =>
            Promise.resolve({
              stageId: 'stage-2',
              format: 'single-elimination',
              seeds: [],
              matches: [],
              hasRecordedResults: false,
            }),
          fetchPromotionPlansTargetingStage: () => Promise.resolve([]),
        })}
        organizationAlias="liga-mendocina"
        stageNumber={2}
        tournamentAlias="apertura"
      />,
    );

    await screen.findByText('Sembrado');
    const seedList = screen.getByRole('list', { name: 'Orden de siembra' });
    expect(within(seedList).queryAllByRole('listitem')).toEqual([]);
  });
});

describe('control api client, 0024 endpoints', () => {
  it('addresses the stage routes and never puts the token in the URL', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = createControlApiClient({
      accessToken: () => 'secret-token',
      baseUrl: '/api',
      fetch: ((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }) as unknown as typeof fetch,
    });

    await client.fetchStandings('liga', 'apertura', 2);
    await client.fetchTiebreakTrace('liga', 'apertura', 2, 'ind');
    await client.fetchSeeding('liga', 'apertura', 2);
    await client.publishSeeding('liga', 'apertura', 2, { seeds: [{ seed: 1, entrantId: 'tll' }] });

    expect(calls.map((call) => call.url)).toEqual([
      '/api/organizations/liga/tournaments/apertura/stages/2/standings',
      '/api/organizations/liga/tournaments/apertura/stages/2/standings/entrants/ind/trace',
      '/api/organizations/liga/tournaments/apertura/stages/2/seeding',
      '/api/organizations/liga/tournaments/apertura/stages/2/seeding',
    ]);
    expect(calls.every((call) => !call.url.includes('secret-token'))).toBe(true);
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer secret-token');
  });

  it('surfaces the server’s message when a publish is refused', async () => {
    const client = createControlApiClient({
      fetch: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Seeding cannot change once a result exists' }), {
            status: 409,
          }),
        )) as unknown as typeof fetch,
    });

    await expect(client.publishSeeding('liga', 'apertura', 1, { seeds: [] })).rejects.toThrow(
      'Seeding cannot change once a result exists',
    );
  });
});
