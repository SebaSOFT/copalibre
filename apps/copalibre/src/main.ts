import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module.js';
import { CliRunner } from './cli-runner.js';

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(CliModule, { logger: false });
  try {
    process.exitCode = await application.get(CliRunner).run(process.argv.slice(2));
  } finally {
    await application.close();
  }
}

void main();
