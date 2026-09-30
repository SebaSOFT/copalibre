import { jest } from '@jest/globals';
import { removeImageBackground, type BackgroundRemovalProgress } from './background-removal.js';

describe('removeImageBackground', () => {
  class TestWorker implements Worker {
    readonly postMessage = jest.fn();
    readonly terminate = jest.fn();
    readonly listeners: Record<string, EventListenerOrEventListenerObject[]> = {};

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
      if (!listener) return;
      this.listeners[type] = this.listeners[type] ?? [];
      this.listeners[type].push(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
      this.listeners[type] = (this.listeners[type] ?? []).filter((h) => h !== listener);
    }

    dispatchEvent(): boolean {
      return true;
    }

    onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
    onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;

    emitMessage(data: unknown): void {
      const event = { data } as MessageEvent;
      for (const listener of this.listeners['message'] ?? []) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }

    emitError(): void {
      const event = new Event('error');
      for (const listener of this.listeners['error'] ?? []) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
  }

  it('posts message with file and publicPath, and resolves when result is received', async () => {
    const worker = new TestWorker();
    const file = new Blob(['source'], { type: 'image/png' });
    const task = removeImageBackground(file, { workerFactory: () => worker });

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const [payload] = worker.postMessage.mock.calls[0] as [
      { id: number; file: Blob; publicPath: string },
    ];
    expect(payload.file).toBe(file);
    expect(payload.publicPath).toContain('/background-removal/1.7.0/assets/');

    const cutoutBlob = new Blob(['cutout'], { type: 'image/png' });
    worker.emitMessage({ id: payload.id, type: 'result', blob: cutoutBlob });

    const result = await task.result;
    expect(result).toBe(cutoutBlob);
  });

  it('reports progress events to onProgress callback', async () => {
    const worker = new TestWorker();
    const file = new Blob(['source'], { type: 'image/png' });
    const progressReports: BackgroundRemovalProgress[] = [];
    const task = removeImageBackground(file, {
      workerFactory: () => worker,
      onProgress: (p) => progressReports.push(p),
    });

    const [payload] = worker.postMessage.mock.calls[0] as [{ id: number }];
    worker.emitMessage({
      id: payload.id,
      type: 'progress',
      key: 'isnet_quint8',
      current: 40,
      total: 100,
    });

    expect(progressReports).toEqual([{ key: 'isnet_quint8', current: 40, total: 100 }]);

    const cutoutBlob = new Blob(['cutout'], { type: 'image/png' });
    worker.emitMessage({ id: payload.id, type: 'result', blob: cutoutBlob });
    await task.result;
  });

  it('rejects when worker reports an error message', async () => {
    const worker = new TestWorker();
    const file = new Blob(['source'], { type: 'image/png' });
    const task = removeImageBackground(file, { workerFactory: () => worker });

    const [payload] = worker.postMessage.mock.calls[0] as [{ id: number }];
    worker.emitMessage({ id: payload.id, type: 'error', message: 'WASM out of memory' });

    await expect(task.result).rejects.toThrow('WASM out of memory');
  });

  it('cancels task, rejects with AbortError, and terminates worker', async () => {
    const worker = new TestWorker();
    const file = new Blob(['source'], { type: 'image/png' });
    const task = removeImageBackground(file, { workerFactory: () => worker });

    task.cancel();

    await expect(task.result).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Background removal cancelled',
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects pending requests when worker errors out', async () => {
    const worker = new TestWorker();
    const file = new Blob(['source'], { type: 'image/png' });
    const task = removeImageBackground(file, { workerFactory: () => worker });

    worker.emitError();

    await expect(task.result).rejects.toThrow('Background removal worker failed');
  });
});
