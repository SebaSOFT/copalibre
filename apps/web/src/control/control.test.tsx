import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

// jsdom ships neither SubtleCrypto nor the text encoders; the browser has both
// and Node exposes the same APIs.
Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
import { createPkcePair, authorizationUrl, verifyCallbackState } from './session/pkce.js';
import {
  FORBIDDEN_STORAGE_KEYS,
  accessTokenHasScope,
  createTokenStore,
  reloadBehaviour,
} from './session/token-store.js';
import {
  buildDashboard,
  isMember,
  type ActivityEntry,
  type TournamentCard,
} from './lib/dashboard.js';
import { Dashboard } from './components/Dashboard.js';
import { DeviceHeartbeat } from './components/DeviceHeartbeat.js';
import { TournamentCard as Card } from './components/TournamentCard.js';
import { QuickStats } from './components/QuickStats.js';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { withIntl } from './i18n/test-support.js';

function card(overrides: Partial<TournamentCard> = {}): TournamentCard {
  return {
    tournamentId: 't-1',
    organizationId: 'org-1',
    alias: 'apertura-2026',
    name: 'Torneo Apertura',
    lifecycle: 'live',
    matchesToday: 2,
    pendingRegistrations: 3,
    ...overrides,
  };
}

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    auditId: 'a-1',
    organizationId: 'org-1',
    action: 'registration.approved',
    actor: 'user:organizer-1',
    occurredAt: '2026-08-01T20:00:00.000Z',
    ...overrides,
  };
}

describe('the access token is never written down', () => {
  it('reads RFC 9068 scopes without treating malformed tokens as authorized', () => {
    const payload = btoa(JSON.stringify({ scp: 'copalibre.control copalibre.super-admin' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(accessTokenHasScope(`header.${payload}.signature`, 'copalibre.super-admin')).toBe(true);
    expect(accessTokenHasScope('opaque-test-token', 'copalibre.super-admin')).toBe(false);
  });

  it('keeps the token in memory and forgets it on clear', () => {
    const store = createTokenStore(() => 1000);
    store.write('secret', 5000);

    expect(store.read()).toBe('secret');
    store.clear();
    expect(store.read()).toBeUndefined();
  });

  it('treats an expired token as absent', () => {
    let now = 1000;
    const store = createTokenStore(() => now);
    store.write('secret', 2000);

    now = 3000;
    expect(store.read()).toBeUndefined();
    expect(store.isExpired()).toBe(true);
  });

  it('touches no persistent storage at all', () => {
    const store = createTokenStore();
    store.write('secret', Date.now() + 60_000);

    // Storage is readable by any script that reaches the page; a module
    // variable dies with the tab.
    for (const key of FORBIDDEN_STORAGE_KEYS) {
      expect(globalThis.localStorage.getItem(key)).toBeNull();
      expect(globalThis.sessionStorage.getItem(key)).toBeNull();
    }
    expect(globalThis.localStorage.length).toBe(0);
    expect(globalThis.sessionStorage.length).toBe(0);
    expect(globalThis.document.cookie).toBe('');
  });

  it('reloads differently per mode, decided in one place', () => {
    expect(reloadBehaviour('strict-stateless')).toBe('reauthenticate');
    expect(reloadBehaviour('pragmatic-persistent')).toBe('silent-renew');
  });
});

describe('PKCE', () => {
  it('derives a challenge from a fresh verifier', async () => {
    const pair = await createPkcePair();
    const other = await createPkcePair();

    expect(pair.method).toBe('S256');
    expect(pair.verifier).not.toBe(other.verifier);
    expect(pair.challenge).not.toBe(pair.verifier);
    // base64url: no padding and no characters a URL would re-encode.
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sends the challenge, never the verifier', async () => {
    const pair = await createPkcePair();
    const url = authorizationUrl({
      authorizeEndpoint: 'https://auth.test/authorize',
      clientId: 'copalibre-control',
      redirectUri: 'https://copalibre.test/control/callback',
      scopes: ['copalibre.control'],
      challenge: pair.challenge,
      state: 'abc',
    });

    expect(url).toContain(`code_challenge=${pair.challenge}`);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).not.toContain(pair.verifier);
  });

  it('refuses a callback whose state it did not start', () => {
    // Otherwise a page cannot tell its own redirect from one somebody else began.
    expect(verifyCallbackState('abc', 'abc')).toBe(true);
    expect(verifyCallbackState('abc', 'other')).toBe(false);
    expect(verifyCallbackState('abc', null)).toBe(false);
    expect(verifyCallbackState('abc', '')).toBe(false);
  });
});

describe('the dashboard is scoped to one organization', () => {
  const model = buildDashboard({
    organizationId: 'org-1',
    tournaments: [card(), card({ tournamentId: 't-2', organizationId: 'org-2' })],
    activity: [entry(), entry({ auditId: 'a-2', organizationId: 'org-2' })],
  });

  it('drops everything that belongs to another organization', () => {
    // An operator in two organizations is ordinary; a screen mixing them is a
    // screen where somebody approves the wrong registration.
    expect(model.tournaments.map((one) => one.tournamentId)).toEqual(['t-1']);
    expect(model.activity.map((one) => one.auditId)).toEqual(['a-1']);
  });

  it('counts the tiles from what is left', () => {
    expect(model.stats).toEqual({
      activeTournaments: 1,
      pendingRegistrations: 3,
      matchesToday: 2,
    });
  });

  it('orders activity newest first', () => {
    const ordered = buildDashboard({
      organizationId: 'org-1',
      tournaments: [],
      activity: [entry({ auditId: 'old', occurredAt: '2026-07-01T00:00:00.000Z' }), entry()],
    });

    expect(ordered.activity.map((one) => one.auditId)).toEqual(['a-1', 'old']);
  });

  it('knows whether a subject belongs here at all', () => {
    expect(isMember({ organizationId: 'org-1' }, 'org-1')).toBe(true);
    expect(isMember({ organizationId: 'org-2' }, 'org-1')).toBe(false);
    expect(isMember({}, 'org-1')).toBe(false);
  });
});

describe('what the dashboard renders', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Dashboard's device-heartbeat panel (0031, 4.4) fetches on mount; a
    // stub here keeps that fetch from crashing tests that never mock it
    // themselves.
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response('[]', { headers: { 'content-type': 'application/json' } }),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  });

  it('shows a tile per stat with its number', () => {
    render(
      withIntl(
        <QuickStats stats={{ activeTournaments: 4, pendingRegistrations: 9, matchesToday: 2 }} />,
      ),
    );

    expect(screen.getByTestId('activeTournaments').textContent).toBe('4');
    expect(screen.getByTestId('pendingRegistrations').textContent).toBe('9');
    expect(screen.getByTestId('matchesToday').textContent).toBe('2');
  });

  it.each([
    ['live', 'LIVE'],
    ['upcoming', 'UPCOMING'],
    ['draft', 'DRAFT'],
    ['finished', 'FINISHED'],
  ] as const)('labels a %s tournament as %s, not only by colour', (lifecycle, label) => {
    render(withIntl(<Card card={card({ lifecycle })} />));

    expect(screen.getByTestId('lifecycle').textContent).toBe(label);
  });

  it('renders the sidenav, the cards and the activity log', () => {
    const model = buildDashboard({
      organizationId: 'org-1',
      tournaments: [card()],
      activity: [entry({ reason: 'Documentación completa' })],
    });
    render(<Dashboard model={model} organizationAlias="liga-mendocina" />);

    expect(screen.getByRole('link', { name: 'Torneos' })).toBeDefined();
    expect(screen.getByText('Torneo Apertura')).toBeDefined();
    expect(screen.getByText(/registration.approved/)).toBeDefined();
    // The two questions an audit trail is asked.
    expect(screen.getByText(/user:organizer-1/)).toBeDefined();
    expect(screen.getByText(/Documentación completa/)).toBeDefined();
  });

  it('says so when there is nothing yet, rather than showing an empty frame', () => {
    render(
      <Dashboard
        model={buildDashboard({ organizationId: 'org-1', tournaments: [], activity: [] })}
        organizationAlias="liga-mendocina"
      />,
    );

    expect(screen.getByText(/no tiene torneos/)).toBeDefined();
    expect(screen.getByText(/Sin actividad/)).toBeDefined();
  });

  it('downloads every CSV view through the organization-scoped API', async () => {
    const requests: string[] = [];
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectUrl = jest.fn(() => 'blob:csv-export');
    const revokeObjectUrl = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string) => {
        // The device-heartbeat panel also fetches on mount; only exports are
        // this test's concern, so its own request is answered but not counted.
        if (url.includes('/display-tokens')) {
          return new Response('[]', { headers: { 'content-type': 'application/json' } });
        }
        requests.push(url);
        return new Response('alias,name\nclub-atletico,Club Atletico\n');
      },
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

    try {
      render(
        <Dashboard
          model={buildDashboard({ organizationId: 'org-1', tournaments: [card()], activity: [] })}
          organizationAlias="liga-mendocina"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Participantes CSV' }));
      fireEvent.click(screen.getByRole('button', { name: 'Resultados CSV' }));
      fireEvent.click(screen.getByRole('button', { name: 'Posiciones CSV' }));

      await waitFor(() => expect(click).toHaveBeenCalledTimes(3));
      expect(requests).toEqual([
        '/organizations/liga-mendocina/tournaments/apertura-2026/exports/participants/team',
        '/organizations/liga-mendocina/tournaments/apertura-2026/exports/results',
        '/organizations/liga-mendocina/tournaments/apertura-2026/exports/standings',
      ]);
      expect(createObjectUrl).toHaveBeenCalledTimes(3);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:csv-export');
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
      click.mockRestore();
    }
  });

  it('archives a finished tournament and removes it from view (0033, 6.1)', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init?: RequestInit) => {
        if (url.includes('/display-tokens')) {
          return new Response('[]', { headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/archive') && init?.method === 'POST') {
          return Response.json({ status: 'archived' });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    render(
      <Dashboard
        model={buildDashboard({
          organizationId: 'org-1',
          tournaments: [card({ lifecycle: 'finished' })],
          activity: [],
        })}
        organizationAlias="liga-mendocina"
      />,
    );

    expect(screen.getByText('Torneo Apertura')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));

    await waitFor(() => expect(screen.queryByText('Torneo Apertura')).toBeNull());
  });

  it('classifies each device by its last-seen signal, not only by label', () => {
    const now = new Date('2026-08-01T12:00:00.000Z').getTime();
    render(
      withIntl(
        <DeviceHeartbeat
          devices={[
            {
              tournamentAlias: 'apertura-2026',
              token: {
                displayTokenId: 'token-online',
                tournamentId: 't-1',
                label: 'Cancha 1',
                revoked: false,
                lastSeenAt: new Date(now - 5_000).toISOString(),
                createdAt: '2026-08-01T00:00:00.000Z',
              },
            },
            {
              tournamentAlias: 'apertura-2026',
              token: {
                displayTokenId: 'token-never-seen',
                tournamentId: 't-1',
                revoked: false,
                createdAt: '2026-08-01T00:00:00.000Z',
              },
            },
          ]}
          now={now}
        />,
      ),
    );

    expect(screen.getByText('Cancha 1')).toBeDefined();
    expect(screen.getByText('token-never-seen')).toBeDefined();
    expect(screen.getByText(/last signal/i)).toBeDefined();
  });

  it('shows no archive action for a tournament that has not finished', () => {
    render(
      <Dashboard
        model={buildDashboard({ organizationId: 'org-1', tournaments: [card()], activity: [] })}
        organizationAlias="liga-mendocina"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
  });
});

describe('the owned component layer', () => {
  it('renders a real button, which a keyboard can reach', () => {
    // A div with a click handler is a control a screen reader cannot name.
    render(<Button variant="destructive">Anular</Button>);
    const button = screen.getByRole('button', { name: 'Anular' });

    expect(button.tagName).toBe('BUTTON');
    expect(button.className).toContain('cl-btn--destructive');
    expect(button.className).toContain('cl-focusable');
  });

  it('cannot render a badge without a word', () => {
    render(<Badge label="BORRADOR" />);

    expect(screen.getByText('BORRADOR')).toBeDefined();
  });
});
