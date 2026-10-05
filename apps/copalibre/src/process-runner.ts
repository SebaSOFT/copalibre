import { spawn } from 'node:child_process';

export interface ProcessRunner {
  run(
    command: string,
    arguments_: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<number>;
  capture?(
    command: string,
    arguments_: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<ProcessOutput>;
}

export interface ProcessOutput {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const systemProcessRunner: ProcessRunner = {
  run(command, arguments_, environment = process.env) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...arguments_], { env: environment, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  },
  capture(command, arguments_, environment = process.env) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...arguments_], {
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  },
};
