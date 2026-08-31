import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';
import {
  PrincipalThrottlerGuard,
  RESOURCE_THROTTLE_LIMIT,
  RESOURCE_THROTTLE_TTL_MS,
} from './principal-throttler.guard.js';
import { SHARED_THROTTLE_KEY } from './shared-throttle.decorator.js';

interface GuardInternals {
  getTracker(req: Record<string, unknown>): Promise<string>;
  handleRequest(props: ThrottlerRequest): Promise<boolean>;
  getRequestResponse(ctx: ExecutionContext): {
    req: Record<string, unknown>;
    res: { header: (k: string, v: unknown) => void };
  };
  throwThrottlingException(ctx: ExecutionContext, detail: unknown): Promise<void>;
  sharedStorage: {
    increment: (
      key: string,
      ttl: number,
      limit: number,
      blockDuration: number,
      throttlerName: string,
    ) => Promise<{
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
    }>;
    operationalSnapshot: () => Promise<{
      activeBuckets: number;
      lastCleanupDeleted: number;
    }>;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function createGuard(reflectorOverrides: Record<string, unknown> = {}) {
  const storage = { increment: jest.fn(), onApplicationShutdown: jest.fn() };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => reflectorOverrides[key]),
  };
  const db = {} as never;

  const options = [{ ttl: 60_000, limit: 1_000 }];
  const guard = new PrincipalThrottlerGuard(
    options as never,
    storage as never,
    reflector as never,
    db,
  );

  return { guard, storage, reflector };
}

function fakeRequest(subject?: {
  principalId?: string;
  subjectId?: string;
}): Record<string, unknown> {
  return {
    ip: '127.0.0.1',
    ips: ['127.0.0.1'],
    subject,
  };
}

function fakeRequestProps(
  overrides: {
    sharedThrottle?: boolean;
    throttlerName?: string;
    limit?: number;
    ttl?: number;
    blockDuration?: number;
    tracker?: string;
  } = {},
) {
  const headers: Record<string, unknown> = {};
  const res = {
    header: jest.fn((k: string, v: unknown) => {
      headers[k] = v;
    }),
  };
  const req = fakeRequest({ principalId: 'p-1' });
  const handler = jest.fn();
  const classRef = class Target {};
  const context = {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getType: () => 'http',
    getArgs: () => [req, res],
    getArgByIndex: (i: number) => [req, res][i],
  } as unknown as ExecutionContext;

  const throttlerName = overrides.throttlerName ?? 'default';
  const getTrackerFn = jest
    .fn<(_req: unknown, _context: unknown) => Promise<string>>()
    .mockResolvedValue(overrides.tracker ?? 'principal-p-1');
  const generateKeyFn = jest.fn(
    (_ctx: unknown, tracker: string, name: string) => `${name}:${tracker}`,
  );

  return {
    context,
    limit: overrides.limit ?? 10,
    ttl: overrides.ttl ?? 60_000,
    throttler: { name: throttlerName === 'default' ? undefined : throttlerName },
    blockDuration: overrides.blockDuration ?? 60_000,
    getTracker: getTrackerFn,
    generateKey: generateKeyFn,
    res,
    headers,
    req,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('PrincipalThrottlerGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  /* ---------- getTracker (task 2.3) ---------- */

  describe('getTracker', () => {
    it('returns principal-prefixed key when principalId is present', async () => {
      const { guard } = createGuard();
      const internals = guard as unknown as GuardInternals;
      const req = fakeRequest({ principalId: 'abc-123', subjectId: 'sub-999' });
      const tracker = await internals.getTracker(req);
      expect(tracker).toBe('principal-abc-123');
    });

    it('falls back to subjectId when principalId is absent', async () => {
      const { guard } = createGuard();
      const internals = guard as unknown as GuardInternals;
      const req = fakeRequest({ subjectId: 'sub-456' });
      const tracker = await internals.getTracker(req);
      expect(tracker).toBe('principal-sub-456');
    });

    it('falls back to the parent IP-based tracker when no subject is set', async () => {
      const { guard } = createGuard();
      const internals = guard as unknown as GuardInternals;
      const req = fakeRequest();
      const tracker = await internals.getTracker(req);
      expect(tracker).not.toMatch(/^principal-/);
    });

    it('falls back to the parent IP-based tracker when subject is undefined', async () => {
      const { guard } = createGuard();
      const internals = guard as unknown as GuardInternals;
      const req: Record<string, unknown> = { ip: '10.0.0.1', ips: ['10.0.0.1'] };
      const tracker = await internals.getTracker(req);
      expect(tracker).not.toMatch(/^principal-/);
    });
  });

  /* ---------- handleRequest route-policy selection (task 2.2) ---------- */

  describe('handleRequest — route-policy selection', () => {
    it('delegates to parent (local storage) when @SharedThrottle is absent', async () => {
      const { guard } = createGuard({ [SHARED_THROTTLE_KEY]: undefined });
      const internals = guard as unknown as GuardInternals;
      const parentHandleRequest = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'handleRequest')
        .mockResolvedValue(true);

      const props = fakeRequestProps();
      const result = await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(result).toBe(true);
      expect(parentHandleRequest).toHaveBeenCalledWith(props);
    });

    it('delegates to parent when reflector returns false for SHARED_THROTTLE_KEY', async () => {
      const { guard } = createGuard({ [SHARED_THROTTLE_KEY]: false });
      const internals = guard as unknown as GuardInternals;
      const parentHandleRequest = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'handleRequest')
        .mockResolvedValue(true);

      const props = fakeRequestProps();
      await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(parentHandleRequest).toHaveBeenCalled();
    });

    it('uses shared storage when @SharedThrottle is true', async () => {
      const { guard } = createGuard({ [SHARED_THROTTLE_KEY]: true });
      const internals = guard as unknown as GuardInternals;
      const sharedIncrement = jest.spyOn(internals.sharedStorage, 'increment').mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const props = fakeRequestProps();
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });

      const result = await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(result).toBe(true);
      expect(sharedIncrement).toHaveBeenCalledWith(
        'default:principal-p-1',
        props.ttl,
        props.limit,
        props.blockDuration,
        'default',
      );
    });
  });

  /* ---------- handleRequest shared-storage branch — headers & blocking ---------- */

  describe('handleRequest — shared storage branch', () => {
    function setupSharedGuard() {
      const { guard, reflector } = createGuard({ [SHARED_THROTTLE_KEY]: true });
      const internals = guard as unknown as GuardInternals;
      const sharedIncrement = jest.spyOn(internals.sharedStorage, 'increment');
      return { guard, internals, reflector, sharedIncrement };
    }

    it('sets rate-limit headers on a non-blocked response', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 3,
        timeToExpire: 45,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const props = fakeRequestProps({ limit: 10 });
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });

      await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Limit$/), 10);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Remaining$/), 7);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Reset$/), 45);
    });

    it('remaining never goes negative', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 15,
        timeToExpire: 30,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const props = fakeRequestProps({ limit: 10 });
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });

      await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Remaining$/), 0);
    });

    it('sets Retry-After and throws when blocked', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 11,
        timeToExpire: 60,
        isBlocked: true,
        timeToBlockExpire: 42,
      });

      const props = fakeRequestProps({ limit: 10 });
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });
      const throwSpy = jest
        .spyOn(internals, 'throwThrottlingException')
        .mockRejectedValue(new Error('throttled'));

      await expect(internals.handleRequest(props as unknown as ThrottlerRequest)).rejects.toThrow(
        'throttled',
      );
      expect(props.res.header).toHaveBeenCalledWith('Retry-After', 42);
      expect(throwSpy).toHaveBeenCalledWith(
        props.context,
        expect.objectContaining({
          limit: 10,
          ttl: 60_000,
          key: 'default:principal-p-1',
          tracker: 'principal-p-1',
          totalHits: 11,
          isBlocked: true,
          timeToBlockExpire: 42,
        }),
      );
    });

    it('appends throttler name suffix to headers for named throttlers', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 2,
        timeToExpire: 30,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const props = fakeRequestProps({ throttlerName: 'resource', limit: 20 });
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });

      await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Limit-resource$/), 20);
      expect(props.res.header).toHaveBeenCalledWith(
        expect.stringMatching(/-Remaining-resource$/),
        18,
      );
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Reset-resource$/), 30);
    });

    it('appends throttler name suffix to Retry-After when blocked on a named throttler', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 25,
        timeToExpire: 60,
        isBlocked: true,
        timeToBlockExpire: 55,
      });

      const props = fakeRequestProps({ throttlerName: 'resource', limit: 20 });
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });
      jest.spyOn(internals, 'throwThrottlingException').mockRejectedValue(new Error('blocked'));

      await expect(internals.handleRequest(props as unknown as ThrottlerRequest)).rejects.toThrow(
        'blocked',
      );
      expect(props.res.header).toHaveBeenCalledWith('Retry-After-resource', 55);
    });

    it('falls back to "default" throttler name when throttler.name is undefined', async () => {
      const { internals, sharedIncrement } = setupSharedGuard();
      sharedIncrement.mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const props = fakeRequestProps();
      jest.spyOn(internals, 'getRequestResponse').mockReturnValue({
        req: props.req,
        res: props.res,
      });

      await internals.handleRequest(props as unknown as ThrottlerRequest);
      expect(props.res.header).toHaveBeenCalledWith(expect.stringMatching(/-Limit$/), 10);
    });
  });

  /* ---------- operational visibility (task 1.5) ---------- */

  describe('sharedStorageSnapshot', () => {
    it('delegates to SharedThrottlerStorage.operationalSnapshot', async () => {
      const { guard } = createGuard();
      const internals = guard as unknown as GuardInternals;
      jest
        .spyOn(internals.sharedStorage, 'operationalSnapshot')
        .mockResolvedValue({ activeBuckets: 7, lastCleanupDeleted: 3 });

      await expect(guard.sharedStorageSnapshot()).resolves.toEqual({
        activeBuckets: 7,
        lastCleanupDeleted: 3,
      });
    });
  });

  /* ---------- exported constants ---------- */

  describe('exported constants', () => {
    it('RESOURCE_THROTTLE_LIMIT is 20', () => {
      expect(RESOURCE_THROTTLE_LIMIT).toBe(20);
    });

    it('RESOURCE_THROTTLE_TTL_MS is 60 seconds', () => {
      expect(RESOURCE_THROTTLE_TTL_MS).toBe(60_000);
    });
  });
});
