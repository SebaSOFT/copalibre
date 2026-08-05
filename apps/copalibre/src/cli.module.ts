import { Module } from '@nestjs/common';
import { CliRunner } from './cli-runner.js';
import { systemProcessRunner } from './process-runner.js';
import { PROCESS_RUNNER } from './tokens.js';

@Module({
  providers: [{ provide: PROCESS_RUNNER, useValue: systemProcessRunner }, CliRunner],
})
export class CliModule {}
