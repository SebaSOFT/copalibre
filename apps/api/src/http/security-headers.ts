import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Baseline security headers on every API response, success or error.
 *
 * The API serves JSON and images, never a document to render, so its Content
 * Security Policy denies everything: a response opened directly in a browser
 * cannot run script, load anything or be framed. The web pages carry their
 * own policy, set by the web role. Nothing frames an API response, hence
 * `X-Frame-Options: DENY` here while the web role allows same-origin frames.
 */
export async function applyApiSecurityHeaders(app: NestFastifyApplication): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
