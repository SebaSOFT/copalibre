import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { DEFAULT_PORT } from './role.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
