import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
} from './lib/api-client.js';
import type { CanvasMatch } from './lib/bracket-canvas.js';
import type { StandingsData } from './lib/standings.js';
import { SeedingControlRoute, StandingsControlRoute } from './components/ControlRoutes.js';
import { SeedingBuilderPage } from './components/SeedingBuilderPage.js';
import { StandingsPage } from './components/StandingsPage.js';

const standings: StandingsData = {
  stageId: 'stage-1',
  projectionVersion: 7,
  fullyResolved: false,
  rows: [
    {
      rank: 1,
      entrantId: 'tll',
      sharedRank: false,
      statistics: { played: 2, points: 6, 'goals-for': 5 },
      tieBroken: false,
    },
    {
      rank: 2,
      entrantId: 'ind',
      sharedRank: true,
      statistics: { played: 2, points: 3, 'goals-for': 2 },
      tieBroken: true,
    },
  ],
  trace: ['Rule 1 (Puntos): tll=6, ind=3 → Puntos resolvió el desempate'],
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

describe('StandingsPage', () => {
  it('shows the projection version and the tiebreak indicator with text, not colour', () => {
    render(
      <StandingsPage
        organizationAlias="liga-mendocina"
        standings={standings}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByText(/Proyección v7/)).toBeTruthy();
    expect(screen.getByText(/empate sin resolver/)).toBeTruthy();
    expect(screen.getByText('Posición compartida')).toBeTruthy();
  });

  it('says so plainly on a row no comparator touched', () => {
    render(
      <StandingsPage
        organizationAlias="liga-mendocina"
        standings={standings}
        tournamentName="Apertura"
      />,
    );
    openRow('tll');

    expect(screen.getByText(/Ningún comparador de desempate/)).toBeTruthy();
  });

  it('fetches a row’s trace once, on first expand', async () => {
    const onExpand = jest.fn(async () => ['Rule 2 (A favor): ind=2 → resuelto']);
    render(
      <StandingsPage
        onExpand={onExpand as unknown as (entrantId: string) => Promise<readonly string[]>}
        organizationAlias="liga-mendocina"
        standings={standings}
        tournamentName="Apertura"
      />,
    );

    const row = openRow('ind');
    await screen.findByText('Rule 2 (A favor): ind=2 → resuelto');

    // Collapsing and reopening must not re-fetch: the trace of a finished
    // calculation does not change while the operator reads it.
    fireEvent(row, new Event('toggle'));
    fireEvent(row, new Event('toggle'));
    await waitFor(() => expect(onExpand).toHaveBeenCalledTimes(1));
  });

  it('reports a trace it could not retrieve instead of rendering an empty panel', async () => {
    render(
      <StandingsPage
        onExpand={() => Promise.reject(new Error('offline'))}
        organizationAlias="liga-mendocina"
        standings={standings}
        tournamentName="Apertura"
      />,
    );
    openRow('ind');

    expect(await screen.findByText(/No se pudo recuperar la traza/)).toBeTruthy();
  });

  it('renders an empty stage without pretending it has rows', () => {
    render(
      <StandingsPage
        organizationAlias="liga-mendocina"
        standings={{ ...standings, rows: [], trace: [] }}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByText(/Todavía no hay resultados/)).toBeTruthy();
    expect(screen.getByText('Sin datos para graficar.')).toBeTruthy();
  });
});

describe('SeedingBuilderPage', () => {
  const seeds = [
    { seed: 1, entrantId: 'tll', locked: false },
    { seed: 2, entrantId: 'ind', locked: false },
  ];

  it('locks a seed and keeps it through a randomize', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={matches}
        organizationAlias="liga-mendocina"
        random={() => 0.99}
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fijar siembra 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sortear no fijados' }));

    const rows = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(rows[0]).toContain('tll');
  });

  it('undoes and redoes a change', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={matches}
        organizationAlias="liga-mendocina"
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByRole('button', { name: 'Deshacer' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Fijar siembra 2' }));
    expect(screen.getByRole('button', { name: 'Liberar siembra 2' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByRole('button', { name: 'Fijar siembra 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));
    expect(screen.getByRole('button', { name: 'Liberar siembra 2' })).toBeTruthy();
  });

  it('blocks every seeding action once a result exists, and explains why', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults
        matches={matches}
        organizationAlias="liga-mendocina"
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('corrección auditada');
    expect(screen.getByRole('button', { name: 'Sortear no fijados' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Publicar sembrado' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('publishes only an order that actually changed', () => {
    const onPublish = jest.fn();
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={matches}
        onPublish={onPublish as unknown as (next: readonly (typeof seeds)[number][]) => void}
        organizationAlias="liga-mendocina"
        random={() => 0}
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByRole('button', { name: 'Publicar sembrado' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sortear no fijados' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar sembrado' }));
    expect(onPublish).toHaveBeenCalled();
  });

  it('names an unresolved slot and shows the format badge', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={matches}
        organizationAlias="liga-mendocina"
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByText('TBD · Ganador del WB-R1-M1')).toBeTruthy();
    expect(screen.getByText('BO3')).toBeTruthy();
  });

  it('zooms the canvas through the declared stops', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={matches}
        organizationAlias="liga-mendocina"
        seeds={seeds}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('says a stage has no structure rather than drawing an empty frame', () => {
    render(
      <SeedingBuilderPage
        hasRecordedResults={false}
        matches={[]}
        organizationAlias="liga-mendocina"
        seeds={[]}
        tournamentName="Apertura"
      />,
    );

    expect(screen.getByText(/Todavía no hay estructura generada/)).toBeTruthy();
    expect(screen.getByText('Esta fase no tiene participantes.')).toBeTruthy();
  });
});

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listDisciplines: () => Promise.resolve([]),
    createTournament: () => Promise.reject(new Error('not used')),
    listRegistrations: () => Promise.resolve([]),
    bulkReview: () => Promise.reject(new Error('not used')),
    reviewRegistration: () => Promise.reject(new Error('not used')),
    fetchStandings: () => Promise.resolve(standings),
    fetchTiebreakTrace: () => Promise.resolve({ entrantId: 'ind', lines: ['linea'] }),
    fetchSeeding: () =>
      Promise.resolve({
        stageId: 'stage-1',
        format: 'single-elimination',
        seeds: [{ seed: 1, entrantId: 'tll' }],
        matches,
        hasRecordedResults: false,
      }),
    publishSeeding: () =>
      Promise.resolve({ mutationClass: 'safe', reason: 'Sin fixtures generados', invalidates: [] }),
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
    openRow('ind');
    expect(await screen.findByText('linea')).toBeTruthy();
  });

  it('reports a standings load it could not complete', async () => {
    render(
      <StandingsControlRoute
        client={stubClient({ fetchStandings: () => Promise.reject(new Error('down')) })}
        organizationAlias="liga-mendocina"
        stageNumber={1}
        tournamentAlias="apertura"
      />,
    );

    expect(await screen.findByText('No se pudieron cargar las posiciones.')).toBeTruthy();
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
