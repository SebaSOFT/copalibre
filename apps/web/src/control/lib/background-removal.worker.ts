import { removeBackground } from '@imgly/background-removal';

type WorkerRequest = { readonly id: number; readonly file: Blob; readonly publicPath: string };

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, file, publicPath } = event.data;
  void removeBackground(file, {
    model: 'isnet_quint8',
    device: 'cpu',
    proxyToWorker: false,
    publicPath,
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      self.postMessage({ id, type: 'progress', key, current, total });
    },
  }).then(
    (blob) => self.postMessage({ id, type: 'result', blob }),
    (error: unknown) =>
      self.postMessage({
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
  );
});
