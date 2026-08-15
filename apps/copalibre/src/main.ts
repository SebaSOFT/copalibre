import { runCli } from './cli.js';
import { systemProcessRunner } from './process-runner.js';

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2), process.env, systemProcessRunner);
}

void main();
