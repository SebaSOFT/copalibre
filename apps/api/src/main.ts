// Throwaway comment: verifying the backend-only CI skip path (0048).
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { API_BODY_LIMIT_BYTES } from './http-body-limit.js';
import { DEFAULT_PORT } from './role.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES }),
  );
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
