import { spawn } from 'node:child_process';

export interface ProcessRunner {
  run(
    command: string,
    arguments_: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<number>;
}

export const systemProcessRunner: ProcessRunner = {
  run(command, arguments_, environment = process.env) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...arguments_], { env: environment, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  },
};
