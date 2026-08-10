import { act, render, screen, waitFor } from '@testing-library/react';
import { ControlApp } from './ControlApp.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { TRANSACTION_KEY, type OidcTransaction } from '../session/oidc-login.js';

function at(path: string): void {
  window.history.replaceState({}, '', path);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
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
    // Dashboard's device-heartbeat panel (0031, 4.4), seeding, and standings
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
        if (url.includes('/standings')) {
          return json({
            stageId: 'stage-1',
            projectionVersion: 1,
            fullyResolved: false,
            rows: [],
            trace: [],
          });
        }
        return json([]);
      },
    });
    // Every screen except `callback` redirects to login with no session
    // (0062) — these tests render as an authenticated operator.
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
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding',
      'Sembrado — apertura-2026',
      'Sembrado',
    ],
    [
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings',
      'Posiciones — apertura-2026',
      'Posiciones',
    ],
  ])('renders the right screen and title for %s', async (path, title) => {
    at(path);
    render(<ControlApp />);

    await waitFor(() => expect(document.title).toBe(title));
  });

  it('renders a not-found state for an unmatched path', () => {
    at('/control/liga-mendocina/nonexistent-screen');
    render(<ControlApp />);

    expect(screen.getByText('Pantalla no encontrada')).toBeDefined();
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

describe('ControlApp session guard and callback (0062)', () => {
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
