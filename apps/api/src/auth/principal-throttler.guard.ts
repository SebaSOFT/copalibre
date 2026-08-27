import { Injectable, Inject } from '@nestjs/common';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { RequestWithSubject } from './request-context.js';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { SharedThrottlerStorage } from './shared-throttler-storage.js';
import { SHARED_THROTTLE_KEY } from './shared-throttle.decorator.js';

/**
 * Rate-limit tracker keyed by the authenticated principal instead of the
 * client IP: an authenticated request already carries a
 * stable identity, which is a better key than IP behind shared NAT or
 * corporate egress. Falls back to the default IP tracking when no subject
 * is present, so an unauthenticated request can never share a bucket with
 * a principal and vice versa.
 */
@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  private readonly sharedStorage: SharedThrottlerStorage;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(DATABASE) db: Kysely<Database>,
  ) {
    super(options, storage, reflector);
    this.sharedStorage = new SharedThrottlerStorage(db);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as RequestWithSubject;
    const principalId = request.subject?.principalId ?? request.subject?.subjectId;
    return principalId ? `principal-${principalId}` : super.getTracker(req);
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const useSharedStorage =
      this.reflector.getAllAndOverride<boolean>(SHARED_THROTTLE_KEY, [
        requestProps.context.getHandler(),
        requestProps.context.getClass(),
      ]) === true;
    if (!useSharedStorage) return super.handleRequest(requestProps);

    const { context, limit, ttl, throttler, blockDuration, getTracker, generateKey } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const tracker = await getTracker(req, context);
    const throttlerName = throttler.name ?? 'default';
    const key = generateKey(context, tracker, throttlerName);
    const result = await this.sharedStorage.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );
    const suffix = throttlerName === 'default' ? '' : `-${throttlerName}`;

    if (result.isBlocked) {
      res.header(`Retry-After${suffix}`, result.timeToBlockExpire);
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        ...result,
      });
    }
    res.header(`${this.headerPrefix}-Limit${suffix}`, limit);
    res.header(`${this.headerPrefix}-Remaining${suffix}`, Math.max(0, limit - result.totalHits));
    res.header(`${this.headerPrefix}-Reset${suffix}`, result.timeToExpire);
    return true;
  }

  /**
   * Secret-safe operational visibility: returns counter-table size and
   * last cleanup activity without exposing bucket keys, source IPs, or
   * principal identifiers.
   */
  async sharedStorageSnapshot(): Promise<{
    readonly activeBuckets: number;
    readonly lastCleanupDeleted: number;
  }> {
    return this.sharedStorage.operationalSnapshot();
  }
}

/**
 * Looser per-principal limit for authenticated, resource-heavy endpoints
 * (Argon2/Sharp/module-fetch cost): bounds a runaway
 * script or compromised token without disturbing an organizer bulk-uploading
 * participant photos in a normal session.
 */
export const RESOURCE_THROTTLE_LIMIT = 20;
export const RESOURCE_THROTTLE_TTL_MS = 60_000;
