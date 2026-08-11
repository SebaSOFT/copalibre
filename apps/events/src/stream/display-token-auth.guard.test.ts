import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { DisplayTokenScope } from '@copalibre/persistence';
import type { Tournament } from '@copalibre/domain';

const displayTokens = {
  scopeOf: jest.fn<() => Promise<DisplayTokenScope | undefined>>(),
};
const tournaments = {
  findByScopedAlias: jest.fn<() => Promise<Tournament | undefined>>(),
};

await jest.unstable_mockModule('@copalibre/persistence', () => ({
  DisplayTokenRepository: jest.fn(() => displayTokens),
  TournamentRepository: jest.fn(() => tournaments),
}));

const { DisplayTokenAuthGuard } = await import('./display-token-auth.guard.js');

const SCOPE: DisplayTokenScope = {
  displayTokenId: 'display-token-1',
  organizationId: 'org-1',
  tournamentId: 'tournament-1',
};

const TOURNAMENT = { tournamentId: 'tournament-1' } as Tournament;

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: { authorization: 'Bearer good' },
    params: { organization: 'liga-mendocina', tournament: 'apertura-2026' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authorizing a /tv stream by display token', () => {
  it('refuses a request with no Authorization header', async () => {
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(guard.canActivate(context({ headers: {}, params: {} }))).rejects.toThrow(
      'Authorization: Bearer',
    );
  });

  it.each([
    ['a scheme it does not know', { authorization: 'Basic abc' }],
    ['a bearer with no value', { authorization: 'Bearer' }],
  ])('refuses %s', async (_label, headers) => {
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(guard.canActivate(context({ headers, params: {} }))).rejects.toThrow();
  });

  it('refuses a display token carried in the query string', async () => {
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(
      guard.canActivate(context(request({ query: { token: 'leaked' } }))),
    ).rejects.toThrow('never appear in a URL');
  });

  it('refuses a token the repository does not recognize', async () => {
    displayTokens.scopeOf.mockResolvedValue(undefined);
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(guard.canActivate(context(request()))).rejects.toThrow('Display token rejected');
  });

  it('refuses a request missing the organization or tournament alias', async () => {
    displayTokens.scopeOf.mockResolvedValue(SCOPE);
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(
      guard.canActivate(context(request({ params: { organization: 'liga-mendocina' } }))),
    ).rejects.toThrow('No tournament named');
  });

  it('refuses an alias that resolves to no tournament', async () => {
    displayTokens.scopeOf.mockResolvedValue(SCOPE);
    tournaments.findByScopedAlias.mockResolvedValue(undefined);
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'No tournament "apertura-2026"',
    );
  });

  it('refuses a token scoped to a different tournament', async () => {
    displayTokens.scopeOf.mockResolvedValue({ ...SCOPE, tournamentId: 'other-tournament' });
    tournaments.findByScopedAlias.mockResolvedValue(TOURNAMENT);
    const guard = new DisplayTokenAuthGuard({} as never);

    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'not scoped to this tournament',
    );
  });

  it('accepts a token scoped to the requested tournament and resolves the real id', async () => {
    displayTokens.scopeOf.mockResolvedValue(SCOPE);
    tournaments.findByScopedAlias.mockResolvedValue(TOURNAMENT);
    const guard = new DisplayTokenAuthGuard({} as never);
    const req = request();

    expect(await guard.canActivate(context(req))).toBe(true);
    expect(req.displayTokenId).toBe('display-token-1');
    expect(req.tournamentId).toBe('tournament-1');
  });
});
