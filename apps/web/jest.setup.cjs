/**
 * jsdom ships no fetch, Headers, Response, SubtleCrypto or text encoders; a
 * browser has all of them. Undici is the implementation Node itself uses, so
 * the control app under test talks to the primitives it will meet in a browser.
 *
 * The encoders go first: undici loads its own encoding module against them.
 */
const { webcrypto } = require('node:crypto');
const { TextDecoder, TextEncoder } = require('node:util');
const { ReadableStream, TransformStream, WritableStream } = require('node:stream/web');
const { MessagePort } = require('node:worker_threads');
const { performance } = require('node:perf_hooks');

const define = (name, value) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

define('TextEncoder', TextEncoder);
define('TextDecoder', TextDecoder);
define('crypto', webcrypto);
// Undici's Response body is a web stream, which jsdom does not provide either.
define('ReadableStream', ReadableStream);
define('WritableStream', WritableStream);
define('TransformStream', TransformStream);
define('MessagePort', MessagePort);
define('performance', performance);

const { fetch, FormData, Headers, Request, Response } = require('undici');
for (const [name, value] of Object.entries({ fetch, FormData, Headers, Request, Response })) {
  define(name, value);
}

// jsdom's global realm doesn't carry over Node's own `structuredClone` —
// fake-indexeddb's `put`/`add` clone every value through it. `v8.serialize`/
// `deserialize` is Node's own underlying mechanism for the real thing, and
// is importable where the bare global isn't.
if (typeof globalThis.structuredClone !== 'function') {
  const v8 = require('node:v8');
  define('structuredClone', (value) => v8.deserialize(v8.serialize(value)));
}

// jsdom ships no IndexedDB implementation at all — the offline queue
// (`offline-queue.ts`, via `idb`) needs a real one to be exercised under
// test. `fake-indexeddb/auto` installs `indexedDB`/`IDBKeyRange` globally.
require('fake-indexeddb/auto');

// jsdom implements the `URL` constructor but not the Blob-registry half of
// the API (the crop modal opens a selected file through an object URL).
const blobStore = new Map();
let nextBlobId = 1;
URL.createObjectURL = (blob) => {
  const url = `blob:jsdom/${nextBlobId++}`;
  blobStore.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url) => {
  blobStore.delete(url);
};

const undiciFetch = globalThis.fetch;
define('fetch', async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input?.href ?? input);
  if (typeof url === 'string' && url.startsWith('blob:')) {
    const blob = blobStore.get(url) ?? new Blob(['mock-blob-bytes'], { type: 'image/png' });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': blob.type || 'image/png' }),
      blob: async () => blob,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '',
    };
  }
  return undiciFetch(input, init);
});

class MockWorker {
  constructor(scriptUrl, options) {
    this.scriptUrl = scriptUrl;
    this.options = options;
    this._listeners = {};
  }
  addEventListener(type, handler) {
    (this._listeners[type] ??= []).push(handler);
  }
  removeEventListener(type, handler) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((h) => h !== handler);
  }
  postMessage(message) {
    queueMicrotask(() => {
      const { id } = message ?? {};
      const handlers = this._listeners.message ?? [];
      for (const handler of handlers) {
        handler({
          data: {
            id,
            type: 'progress',
            key: 'isnet_quint8',
            current: 100,
            total: 100,
          },
        });
        handler({
          data: {
            id,
            type: 'result',
            blob: new Blob(['mock-cutout-png-bytes'], { type: 'image/png' }),
          },
        });
      }
    });
  }
  terminate() {
    this._listeners = {};
  }
}
define('Worker', MockWorker);

/**
 * jsdom loads no image bytes and ships no `<canvas>` renderer (that needs the
 * optional native `canvas` package, not a dependency here) — the crop
 * pipeline (`image-upload.ts#cropToPng`) needs both a `new Image()` that
 * actually "loads", and a 2D context that accepts draw calls without
 * throwing, to be exercised under test at all. `width`/`height` are set to a
 * plausible 4:5 source photo so `react-easy-crop`'s own `onMediaLoaded` also
 * sees a non-zero media size.
 */
class MockImage {
  constructor() {
    this._listeners = {};
    this.width = 1200;
    this.height = 1500;
    this.crossOrigin = null;
  }
  addEventListener(type, handler) {
    (this._listeners[type] ??= []).push(handler);
  }
  removeEventListener(type, handler) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((h) => h !== handler);
  }
  set src(value) {
    this._src = value;
    queueMicrotask(() => {
      for (const handler of this._listeners.load ?? []) handler();
    });
  }
  get src() {
    return this._src;
  }
}
define('Image', MockImage);

// jsdom's own `getContext`/`toBlob` exist as functions but only log
// "not implemented" and do nothing (no `canvas` native binding is installed
// in this repo) — a `typeof === 'function'` feature check can't tell that
// apart from a working implementation, so these are unconditional.
const mock2dContext = {
  translate: () => undefined,
  rotate: () => undefined,
  drawImage: () => undefined,
  clearRect: () => undefined,
};
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    return kind === '2d' ? mock2dContext : null;
  };
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
    callback(new Blob(['jsdom-mock-png-bytes'], { type: type ?? 'image/png' }));
  };
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
