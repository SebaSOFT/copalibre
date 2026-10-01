export interface BackgroundRemovalProgress {
  readonly key: string;
  readonly current: number;
  readonly total: number;
}

export interface BackgroundRemovalTask {
  readonly result: Promise<Blob>;
  readonly cancel: () => void;
}

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  {
    readonly resolve: (blob: Blob) => void;
    readonly reject: (error: Error) => void;
    readonly onProgress?: (progress: BackgroundRemovalProgress) => void;
  }
>();

function attachWorkerListeners(target: Worker): Worker {
  target.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as {
      readonly id: number;
      readonly type: 'progress' | 'result' | 'error';
      readonly key?: string;
      readonly current?: number;
      readonly total?: number;
      readonly blob?: Blob;
      readonly message?: string;
    };
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') {
      request.onProgress?.({
        key: message.key ?? '',
        current: message.current ?? 0,
        total: message.total ?? 0,
      });
    } else {
      pending.delete(message.id);
      if (message.type === 'result' && message.blob) request.resolve(message.blob);
      else request.reject(new Error(message.message ?? 'Background removal failed'));
    }
  });
  target.addEventListener('error', () => {
    for (const request of pending.values())
      request.reject(new Error('Background removal worker failed'));
    pending.clear();
    target.terminate();
    if (target === worker) worker = undefined;
  });
  return target;
}

function getWorker(factory?: () => Worker): Worker {
  if (factory) return attachWorkerListeners(factory());
  if (!worker) {
    worker = attachWorkerListeners(
      new Worker(new URL('./background-removal.worker.ts', import.meta.url), { type: 'module' }),
    );
  }
  return worker;
}

export function removeImageBackground(
  file: Blob,
  options: {
    readonly onProgress?: (progress: BackgroundRemovalProgress) => void;
    readonly workerFactory?: () => Worker;
  } = {},
): BackgroundRemovalTask {
  const id = nextId++;
  let settled = false;
  let resolveResult!: (blob: Blob) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<Blob>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const activeWorker = getWorker(options.workerFactory);
  pending.set(id, { resolve: resolveResult, reject: rejectResult, onProgress: options.onProgress });
  activeWorker.postMessage({
    id,
    file,
    publicPath: new URL('/background-removal/1.7.0/assets/', window.location.origin).href,
  });
  return {
    result,
    cancel: () => {
      if (settled || !pending.has(id)) return;
      settled = true;
      pending.get(id)?.reject(new DOMException('Background removal cancelled', 'AbortError'));
      pending.delete(id);
      activeWorker.terminate();
      if (activeWorker === worker) worker = undefined;
    },
  };
}
