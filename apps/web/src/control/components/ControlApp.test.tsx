import { act, render, screen, waitFor } from '@testing-library/react';
import { ControlApp } from './ControlApp.js';
import { navigateControl } from '../lib/control-navigation.js';

function at(path: string): void {
  window.history.replaceState({}, '', path);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
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
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    at('/control/liga-mendocina');
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
