import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithSubject } from './request-context.js';

/**
 * Rate-limit tracker keyed by the authenticated principal instead of the
 * client IP (0145 design.md): an authenticated request already carries a
 * stable identity, which is a better key than IP behind shared NAT or
 * corporate egress. Falls back to the default IP tracking when no subject
 * is present, so an unauthenticated request can never share a bucket with
 * a principal and vice versa.
 */
@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as RequestWithSubject;
    const principalId = request.subject?.principalId ?? request.subject?.subjectId;
    return principalId ? `principal-${principalId}` : super.getTracker(req);
  }
}

/**
 * Looser per-principal limit for authenticated, resource-heavy endpoints
 * (Argon2/Sharp/module-fetch cost — 0145 design.md D3): bounds a runaway
 * script or compromised token without disturbing an organizer bulk-uploading
 * participant photos in a normal session.
 */
export const RESOURCE_THROTTLE_LIMIT = 20;
export const RESOURCE_THROTTLE_TTL_MS = 60_000;
