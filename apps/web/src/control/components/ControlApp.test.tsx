import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControlApp } from './ControlApp.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { DEFAULT_RETURN_TO, TRANSACTION_KEY, type OidcTransaction } from '../session/oidc-login.js';

function at(path: string): void {
  window.history.replaceState({}, '', path);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function scopedToken(scopes: string): string {
  const payload = btoa(JSON.stringify({ scp: scopes }));
  return `header.${payload}.signature`;
}

function transaction(overrides: Partial<OidcTransaction> = {}): OidcTransaction {
  return {
    state: 'state-123',
    verifier: 'verifier-abc',
    redirectUri: 'http://localhost/control/callback',
    tokenEndpoint: 'https://identity.example/token',
    clientId: 'copalibre-control',
    returnTo: '/control/liga-mendocina',
    ...overrides,
  };
}

describe('ControlApp', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Dashboard's device-heartbeat panel, seeding, and standings
    // all fetch on mount; a URL-routed stub keeps every screen from crashing
    // on a response shape it didn't ask for, matching control.test.tsx's own
    // fetch-stub pattern for the screens that only need `[]`.
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://identity.example/token') {
          return json({ access_token: 'fresh-access-token', expires_in: 3600 });
        }
        if (url.includes('/seeding')) {
          return json({
            stageId: 'stage-1',
            format: 'single-elimination',
            seeds: [],
            matches: [],
            hasRecordedResults: false,
          });
        }
        if (url.includes('/configuration')) {
          return json({ overrides: {} });
        }
        if (url.includes('/standings')) {
          return json({
            stageId: 'stage-1',
            projectionVersion: 1,
            fullyResolved: false,
            rows: [],
            trace: [],
          });
        }
        if (url.endsWith('/tables')) {
          return json({
            layouts: [
              {
                code: 'group-standings-default',
                target: 'group-phase',
                label: 'Group Standings',
                entityGranularity: 'team',
              },
            ],
          });
        }
        if (url.includes('/tables/')) {
          return json({
            layoutCode: 'group-standings-default',
            target: 'group-phase',
            label: 'Group Standings',
            columns: [],
            defaultSort: [],
            rows: [],
            projectionVersion: 1,
          });
        }
        if (url.includes('/internal-matches-view')) {
          return json({ matches: [] });
        }
        if (url.endsWith('/tournaments/apertura-2026/settings')) {
          return json({ name: 'Apertura 2026', region: 'Cuyo', capacity: 16 });
        }
        if (url.endsWith('/tournaments/apertura-2026/ruleset-overrides')) {
          return json({ overrides: { 'scoring.pointsPerWin': 3 } });
        }
        return json([]);
      },
    });
    // Every screen except `callback` redirects to login with no session
    // — these tests render as an authenticated operator.
    controlTokenStore.write('test-access-token', Date.now() + 60_000);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    at('/control/liga-mendocina');
    controlTokenStore.clear();
  });

  it.each([
    ['/control/liga-mendocina', 'Panel — liga-mendocina', 'Torneos'],
    ['/control/liga-mendocina/roles', 'Roles y permisos - liga-mendocina', 'Rol'],
    ['/control/liga-mendocina/tournaments/new', 'Crear torneo — liga-mendocina', 'torneo'],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/registrations',
      'Inscripciones — apertura-2026',
      'Inscripciones',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/reports',
      'Reportes y disputas — apertura-2026',
      'reporte',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/matches-view',
      'Partidos — apertura-2026',
      'Partidos',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/settings',
      'Configuración del torneo — apertura-2026',
      'Configuración del torneo',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/ruleset',
      'Reglamento del torneo — apertura-2026',
      'scoring.pointsPerWin',
    ],
    ['/control/liga-mendocina/clubs', 'Clubes — liga-mendocina', 'club'],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/zones',
      'Zonas y grupos — apertura-2026',
      'Zona',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding',
      'Sembrado — apertura-2026',
      'Sembrado',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings',
      'Posiciones — apertura-2026',
      'Posiciones',
    ],
    ['/control/login', 'Iniciar sesión — CopaLibre', 'Ingresá para operar'],
    ['/control/forgot-password', 'Recuperar contraseña — CopaLibre', 'Recuperar contraseña'],
    [
      '/control/reset-password',
      'Restablecer contraseña — CopaLibre',
      'Enlace de recuperación inválido',
    ],
    [
      '/control/liga-mendocina/preferences',
      'Preferencias personales — CopaLibre',
      'Personal Preferences',
    ],
    ['/control/liga-mendocina/tournaments', 'Torneos — liga-mendocina', 'Torneo'],
    ['/control/liga-mendocina/live', 'Consola en vivo — liga-mendocina', 'Consola'],
    [
      '/control/liga-mendocina/organization',
      'Organización — liga-mendocina',
      'Personal Preferences',
    ],
    ['/control/liga-mendocina/analytics', 'Analíticas — liga-mendocina', 'Analítica'],
  ])('renders the right screen and title for %s', async (path, title, content) => {
    at(path);
    render(<ControlApp />);

    await waitFor(() => expect(document.title).toBe(title));
    expect(screen.getAllByText(content, { exact: false }).length).toBeGreaterThan(0);
  });

  it('renders a not-found state for an unmatched path', () => {
    at('/control/liga-mendocina/nonexistent-screen');
    render(<ControlApp />);

    expect(screen.getByText('Pantalla no encontrada')).toBeDefined();
  });

  it('renders global platform administration for a super-admin token', async () => {
    controlTokenStore.write(
      scopedToken('copalibre.control copalibre.super-admin'),
      Date.now() + 60_000,
    );
    at('/control/platform');
    render(<ControlApp />);

    await waitFor(() => expect(document.title).toBe('Administración de plataforma — CopaLibre'));
    expect(screen.getByRole('heading', { name: 'Administración de plataforma' })).toBeDefined();
  });

  it('does not render platform administration without the super-admin scope', () => {
    at('/control/platform');
    render(<ControlApp />);

    expect(screen.queryByRole('heading', { name: 'Administración de plataforma' })).toBeNull();
  });

  it('re-renders the matching screen after client-side navigation, without a page reload', async () => {
    at('/control/liga-mendocina');
    render(<ControlApp />);
    await waitFor(() => expect(document.title).toBe('Panel — liga-mendocina'));

    act(() => {
      navigateControl('/control/liga-mendocina/roles');
    });

    await waitFor(() => expect(document.title).toBe('Roles y permisos - liga-mendocina'));
    expect(window.location.pathname).toBe('/control/liga-mendocina/roles');
  });

  it('re-renders after browser back/forward (popstate)', async () => {
    at('/control/liga-mendocina');
    render(<ControlApp />);
    await waitFor(() => expect(document.title).toBe('Panel — liga-mendocina'));

    act(() => {
      navigateControl('/control/liga-mendocina/roles');
    });
    await waitFor(() => expect(document.title).toBe('Roles y permisos - liga-mendocina'));

    act(() => {
      window.history.pushState({}, '', '/control/liga-mendocina');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(document.title).toBe('Panel — liga-mendocina'));
  });
});

describe('ControlApp session guard and callback', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL) => {
        if (String(input) === 'https://identity.example/token') {
          return json({ access_token: 'fresh-access-token', expires_in: 3600 });
        }
        return json([]);
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    sessionStorage.clear();
    controlTokenStore.clear();
    at('/control/liga-mendocina');
  });

  // jsdom's `Location.assign` isn't mockable (non-configurable), so the
  // guard's redirect target is covered directly by `loginRedirectUrl`'s own
  // tests (control-navigation.test.ts); what's verified here is the guard's
  // *rendering* decision — a protected screen never shows its content with
  // no session.
  it('does not render a protected screen with no session', () => {
    controlTokenStore.clear();
    at('/control/liga-mendocina/roles');

    render(<ControlApp />);

    expect(screen.queryByText('Rol')).toBeNull();
  });

  it('renders normally when a valid session exists', async () => {
    controlTokenStore.write('test-access-token', Date.now() + 60_000);
    at('/control/liga-mendocina');

    render(<ControlApp />);

    await waitFor(() => expect(document.title).toBe('Panel — liga-mendocina'));
    expect(screen.queryByText('Torneos')).not.toBeNull();
  });

  it('completes the callback and client-side-navigates to returnTo, without a page reload', async () => {
    sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction()));
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(controlTokenStore.read()).toBe('fresh-access-token'));
    await waitFor(() => expect(window.location.pathname).toBe('/control/liga-mendocina'));
  });

  it('shows an error and does not store a token when the callback fails', async () => {
    sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction({ state: 'other-state' })));
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(screen.getByText('No se pudo completar el acceso')).toBeDefined());
    expect(controlTokenStore.read()).toBeUndefined();
  });
});

describe('ControlApp default-returnTo login landing', () => {
  let originalFetch: typeof fetch;

  function membership(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      organizationId: 'org-1',
      organizationAlias: 'liga-mendocina',
      organizationName: 'Liga Mendocina',
      role: 'admin',
      ...overrides,
    };
  }

  function stubFetch(myOrganizations: unknown): void {
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://identity.example/token') {
          return json({ access_token: 'fresh-access-token', expires_in: 3600 });
        }
        if (url.includes('/organizations?mine=true')) {
          if (myOrganizations === 'error') {
            return new Response('boom', { status: 500 });
          }
          return json(myOrganizations);
        }
        return json([]);
      },
    });
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    sessionStorage.clear();
    controlTokenStore.clear();
    at('/control/liga-mendocina');
  });

  it('sends the operator straight to the dashboard when there is exactly one organization', async () => {
    stubFetch([membership()]);
    sessionStorage.setItem(
      TRANSACTION_KEY,
      JSON.stringify(transaction({ returnTo: DEFAULT_RETURN_TO })),
    );
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(window.location.pathname).toBe('/control/liga-mendocina'));
  });

  it('shows an explanatory empty state for an operator with no organizations', async () => {
    stubFetch([]);
    sessionStorage.setItem(
      TRANSACTION_KEY,
      JSON.stringify(transaction({ returnTo: DEFAULT_RETURN_TO })),
    );
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    // Test environment resolves to Spanish (no stored/browser preference set),
    // same as every other ControlApp test's expected copy.
    await waitFor(() => expect(screen.getByText('Sin organizaciones todavía')).toBeDefined());
    // Stays on the callback screen rather than the "not found" screen the
    // original bug landed on.
    expect(window.location.pathname).toBe('/control/callback');
  });

  it('shows a picker for an operator with more than one organization, each linking to its dashboard', async () => {
    stubFetch([
      membership(),
      membership({
        organizationId: 'org-2',
        organizationAlias: 'liga-cuyana',
        organizationName: 'Liga Cuyana',
        role: 'viewer',
      }),
    ]);
    sessionStorage.setItem(
      TRANSACTION_KEY,
      JSON.stringify(transaction({ returnTo: DEFAULT_RETURN_TO })),
    );
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(screen.getByText('Elegir una organización')).toBeDefined());
    const link = screen.getByRole('link', { name: /Liga Cuyana/ });
    expect(link.getAttribute('href')).toBe('/control/liga-cuyana');

    fireEvent.click(link);
    await waitFor(() => expect(window.location.pathname).toBe('/control/liga-cuyana'));
  });

  it('shows the error view when the organization lookup itself fails', async () => {
    stubFetch('error');
    sessionStorage.setItem(
      TRANSACTION_KEY,
      JSON.stringify(transaction({ returnTo: DEFAULT_RETURN_TO })),
    );
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(screen.getByText('No se pudo completar el acceso')).toBeDefined());
  });

  it('leaves a guard-redirected login (a real returnTo) untouched — the redirect decision itself performs no lookup', async () => {
    // The destination screen fetches organizations on its own, afterward, to
    // resolve its nav role (openspec 0165) — expected and unrelated to this
    // test. What must stay true is narrower: `CompletingLogin`'s redirect
    // decision for a real (non-default) returnTo never awaits that lookup
    // first, so a request to it before the pathname changes would mean the
    // fast path regressed into blocking on one.
    let organizationsRequestedBeforeRedirect = false;
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://identity.example/token') {
          return json({ access_token: 'fresh-access-token', expires_in: 3600 });
        }
        if (
          url.includes('/organizations?mine=true') &&
          window.location.pathname !== '/control/liga-mendocina'
        ) {
          organizationsRequestedBeforeRedirect = true;
        }
        return json([]);
      },
    });
    sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction()));
    at('/control/callback?code=auth-code-1&state=state-123');

    render(<ControlApp />);

    await waitFor(() => expect(window.location.pathname).toBe('/control/liga-mendocina'));
    expect(organizationsRequestedBeforeRedirect).toBe(false);
  });

  it('navigates from /control to the organization dashboard when exactly one organization exists', async () => {
    stubFetch([membership()]);
    at('/control');
    controlTokenStore.write('test-token', Date.now() + 60_000);
    render(<ControlApp />);

    await waitFor(() => expect(window.location.pathname).toBe('/control/liga-mendocina'));
  });

  it('renders organization picker from /control when multiple organizations exist', async () => {
    stubFetch([
      membership({ organizationId: 'org-1' }),
      membership({
        organizationId: 'org-2',
        organizationAlias: 'liga-sanjuanina',
        organizationName: 'Liga Sanjuanina',
      }),
    ]);

    at('/control');
    controlTokenStore.write('test-token', Date.now() + 60_000);
    render(<ControlApp />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Liga Mendocina/ })).toBeDefined();
      expect(screen.getByRole('link', { name: /Liga Sanjuanina/ })).toBeDefined();
    });
  });
});
