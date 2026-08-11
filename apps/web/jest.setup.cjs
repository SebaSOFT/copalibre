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
