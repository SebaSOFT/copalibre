import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { API_BODY_LIMIT_BYTES } from './http-body-limit.js';
import { DEFAULT_PORT } from './role.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: a self-hosted install sits behind a reverse proxy; without
    // this every request's `ip` is the proxy's own address, which would key
    // the per-IP rate limits off the proxy and collapse all clients
    // into one bucket.
    new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES, trustProxy: true }),
  );
  if (process.env.COPALIBRE_APP_URL) {
    app.enableCors({ origin: process.env.COPALIBRE_APP_URL });
  }
  // Global request validation: every @Body DTO decorated
  // with class-validator rules is enforced here; unknown properties are
  // stripped (whitelist) but not yet rejected — forbidNonWhitelisted is a
  // deliberate later flip once stripping proves harmless in deployment.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
