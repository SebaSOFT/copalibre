import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { API_BODY_LIMIT_BYTES } from './http-body-limit.js';
import { DEFAULT_PORT } from './role.js';
import { createApiValidationPipe } from './http/validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: a self-hosted install sits behind a reverse proxy; without
    // this every request's `ip` is the proxy's own address, which would key
    // the per-IP rate limits off the proxy and collapse all clients
    // into one bucket.
    new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES, trustProxy: true }),
  );
  // Baseline security response headers. `contentSecurityPolicy: false` is
  // explicit: a real CSP directive set is deferred (needs an audit across
  // every script/style surface first), and leaving it unconfigured would
  // let helmet apply its own default CSP instead, which is not what
  // "deferred" means. `X-Content-Type-Options: nosniff` is one of helmet's
  // always-on defaults. No `iframe`/embed usage exists anywhere in
  // apps/web, so `xFrameOptions: { action: 'deny' }` has no known
  // legitimate framing use case to break.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  if (process.env.COPALIBRE_APP_URL) {
    app.enableCors({ origin: process.env.COPALIBRE_APP_URL });
  }
  // Global request validation: every @Body DTO decorated
  // with class-validator rules is enforced here; unknown properties are
  // rejected with structured 400 validation responses.
  app.useGlobalPipes(createApiValidationPipe());
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
