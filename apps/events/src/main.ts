import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { trustedProxiesFromEnv } from '@copalibre/auth';
import { AppModule } from './app.module.js';
import { DEFAULT_PORT } from './role.js';

async function bootstrap(): Promise<void> {
  // The stream admission limits key on the client address. Behind the gateway
  // that address arrives in X-Forwarded-For, believed only from the configured
  // proxies; without this every viewer would share the proxy's one bucket.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: trustedProxiesFromEnv() as string[] | false }),
  );
  if (process.env.COPALIBRE_APP_URL) {
    app.enableCors({ origin: process.env.COPALIBRE_APP_URL });
  }
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
