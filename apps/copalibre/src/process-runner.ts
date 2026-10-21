import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface SupervisedProcess {
  readonly role: string;
  readonly command: string;
  readonly arguments: readonly string[];
}

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
  runSupervised?(
    processes: readonly SupervisedProcess[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<number>;
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
  runSupervised(processes, environment = process.env) {
    return superviseProcesses(processes, environment);
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

export function superviseProcesses(
  processes: readonly SupervisedProcess[],
  environment: NodeJS.ProcessEnv = process.env,
  spawnProcess: typeof spawn = spawn,
): Promise<number> {
  if (processes.length === 0) return Promise.resolve(0);
  return new Promise((resolve) => {
    const children = new Map<ChildProcess, string>();
    const spawnOptions: SpawnOptions = {
      env: environment,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    };
    let stopping = false;
    let settled = false;
    let stoppedWith = 1;
    const closed = new Set<ChildProcess>();
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      process.off('SIGHUP', onSighup);
      resolve(code);
    };

    const killAll = (signal: NodeJS.Signals): void => {
      for (const child of children.keys()) {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          child.kill(signal);
        }
      }
    };

    const stopForExit = (
      role: string,
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (stopping) return;
      stopping = true;
      stoppedWith = code && code > 0 ? code : 1;
      const outcome =
        code === 0 ? 'exited unexpectedly' : `exited with ${code ?? signal ?? 'an error'}`;
      process.stderr.write(`${role} ${outcome}; stopping the other hybrid development roles.\n`);
      killAll('SIGTERM');
      killTimer = setTimeout(() => {
        killAll('SIGKILL');
        finish(stoppedWith);
      }, 5000);
    };

    const onSigint = (): void => {
      stopping = true;
      killAll('SIGINT');
      stopForSignal(130);
    };
    const onSigterm = (): void => {
      stopping = true;
      killAll('SIGTERM');
      stopForSignal(143);
    };
    const onSighup = (): void => {
      stopping = true;
      killAll('SIGHUP');
      stopForSignal(129);
    };
    const stopForSignal = (code: number): void => {
      stoppedWith = code;
      killTimer = setTimeout(() => {
        killAll('SIGKILL');
        finish(code);
      }, 5000);
      if (closed.size === children.size) finish(code);
    };
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    process.on('SIGHUP', onSighup);

    for (const specification of processes) {
      const child = spawnProcess(specification.command, [...specification.arguments], spawnOptions);
      children.set(child, specification.role);
      child.once('error', (error) => {
        process.stderr.write(`${specification.role} failed to start: ${error.message}\n`);
        stopForExit(specification.role, 1, null);
      });
      child.once('close', (code, signal) => {
        closed.add(child);
        if (!stopping) stopForExit(specification.role, code, signal);
        else if (closed.size === children.size) finish(stoppedWith);
      });
    }
  });
}
