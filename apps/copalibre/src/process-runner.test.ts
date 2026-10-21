import { EventEmitter } from 'node:events';
import type { ChildProcess, spawn } from 'node:child_process';
import { jest } from '@jest/globals';
import { superviseProcesses, type SupervisedProcess } from './process-runner.js';

function childProcess(): ChildProcess & { readonly kill: jest.Mock } {
  const child = new EventEmitter() as ChildProcess & { readonly kill: jest.Mock };
  Object.defineProperty(child, 'pid', { value: undefined });
  Object.defineProperty(child, 'kill', { value: jest.fn(() => true) });
  return child;
}

describe('superviseProcesses', () => {
  it('names the exited role, stops siblings, and returns a non-zero status', async () => {
    const api = childProcess();
    const events = childProcess();
    const children = [api, events];
    const spawnProcess = jest.fn(() => {
      const child = children.shift();
      if (!child) throw new Error('No child process was queued for this role');
      return child;
    }) as unknown as typeof spawn;
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const roles: readonly SupervisedProcess[] = [
      { role: 'api', command: 'yarn', arguments: ['workspace', '@copalibre/api', 'run', 'dev'] },
      {
        role: 'events',
        command: 'yarn',
        arguments: ['workspace', '@copalibre/events', 'run', 'dev'],
      },
    ];

    try {
      const result = superviseProcesses(roles, {}, spawnProcess);
      api.emit('close', 17, null);
      events.emit('close', null, 'SIGTERM');
      await expect(result).resolves.toBe(17);
      expect(events.kill).toHaveBeenCalledWith('SIGTERM');
      expect(stderr).toHaveBeenCalledWith(
        'api exited with 17; stopping the other hybrid development roles.\n',
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
