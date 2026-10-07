import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright-core';
import type { Cutout } from './cutout-cache.js';

/** The version of the IMG.LY model assets the control console serves (apps/web). */
const ASSET_VERSION = '1.7.0';
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const DEFAULT_ASSETS_DIRECTORY = path.resolve(
  PACKAGE_ROOT,
  '../../apps/web/public/background-removal',
  ASSET_VERSION,
  'assets',
);

/**
 * The page script: the same call `apps/web/src/control/lib/background-removal.worker.ts` makes
 * (isnet_quint8 on the CPU, PNG out), only on the page's own thread instead of a worker.
 */
const PAGE_SCRIPT = `
import { removeBackground } from '@imgly/background-removal';
window.cutout = async (base64, publicPath) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = await removeBackground(new Blob([bytes], { type: 'image/png' }), {
    model: 'isnet_quint8',
    device: 'cpu',
    proxyToWorker: false,
    publicPath,
    output: { format: 'image/png' },
  });
  const out = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < out.length; i += 0x8000) binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(binary);
};
window.ready = true;
`;

export interface BrowserCutout {
  readonly cutout: Cutout;
  readonly close: () => Promise<void>;
}

async function serve(assetsDirectory: string, script: string): Promise<Server> {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/') {
        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><script type="module" src="/page.js"></script>');
      } else if (url.pathname === '/page.js') {
        response.setHeader('content-type', 'text/javascript');
        response.end(script);
      } else if (url.pathname.startsWith(`/background-removal/${ASSET_VERSION}/assets/`)) {
        const name = path.basename(url.pathname);
        try {
          const bytes = await readFile(path.join(assetsDirectory, name));
          response.setHeader(
            'content-type',
            name.endsWith('.wasm')
              ? 'application/wasm'
              : name.endsWith('.mjs')
                ? 'text/javascript'
                : name.endsWith('.json')
                  ? 'application/json'
                  : 'application/octet-stream',
          );
          response.end(bytes);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      } else {
        response.statusCode = 404;
        response.end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/**
 * Opens a headless Chromium and loads IMG.LY's background removal in it, with the model and runtime
 * assets the console ships. A browser is used rather than Node bindings so the emblems go through
 * exactly the process users get when they upload a logo.
 */
export async function openBrowserCutout(
  assetsDirectory: string = DEFAULT_ASSETS_DIRECTORY,
): Promise<BrowserCutout> {
  try {
    await readFile(path.join(assetsDirectory, 'resources.json'));
  } catch {
    throw new Error(
      `background removal assets not found in ${assetsDirectory}; run: node apps/web/scripts/copy-background-removal-assets.mjs`,
    );
  }
  const bundled = await build({
    stdin: { contents: PAGE_SCRIPT, resolveDir: PACKAGE_ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  const server = await serve(assetsDirectory, bundled.outputFiles[0]?.text ?? '');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('pageerror', (error) => process.stderr.write(`cutout page error: ${error.message}\n`));
    await page.goto(origin);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
    const publicPath = `${origin}/background-removal/${ASSET_VERSION}/assets/`;
    return {
      cutout: async (png, label) => {
        try {
          const base64 = await page.evaluate(
            ([input, assets]) =>
              (window as unknown as { cutout: (b: string, p: string) => Promise<string> }).cutout(
                input as string,
                assets as string,
              ),
            [png.toString('base64'), publicPath],
          );
          return Buffer.from(base64, 'base64');
        } catch (error) {
          throw new Error(`background removal failed for ${label}`, { cause: error });
        }
      },
      close: async () => {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  } catch (error) {
    await browser?.close();
    server.close();
    throw error;
  }
}
