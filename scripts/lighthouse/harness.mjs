import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERFORMANCE_ROUTES } from './budgets.mjs';
import { startPerformanceFixtureApi } from './performance-fixture-api.mjs';

/**
 * Serves the built public site the way an installation's web role does, so the
 * performance budgets measure what visitors receive: the shipped
 * deploy/web/Caddyfile in the web role's own Caddy image, with its compression,
 * headers and routing, in front of the built on-demand renderer and a fixture
 * API that also answers the event streams.
 *
 * Caddy runs in Docker with its port published on the host's loopback: the
 * Caddyfile listens on 4321. It reaches the renderer and the fixture on the
 * host through host.docker.internal (Docker Desktop names it; on Linux the
 * host-gateway mapping below does), so those two listen on every interface
 * while they run. Host networking would avoid that, but Docker Desktop does
 * not share the host's network by default.
 */

const CONTAINER_HOST = 'host.docker.internal';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The Caddyfile's own listening port; the shipped file is measured unmodified. */
export const HARNESS_PORT = 4321;

/**
 * The web role's Caddy image, read from the Dockerfile's `web` stage so the
 * harness and the shipped image never drift apart. Workflows take Docker Hub
 * images through Google's mirror, never from Docker Hub directly.
 */
export async function webRoleCaddyImage(dockerfile) {
  const source = dockerfile ?? (await readFile(resolve(projectRoot, 'Dockerfile'), 'utf8'));
  const stage = source.match(/^FROM\s+(\S+)\s+AS\s+web\s*$/im);
  if (!stage) throw new Error('The Dockerfile has no `web` stage to take the Caddy image from');
  const image = stage[1];
  return image.includes('/') ? image : `mirror.gcr.io/library/${image}`;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'ignore' });
    child.once('error', () => resolveRun(1));
    child.once('exit', (code) => resolveRun(code ?? 1));
  });
}

function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    child.once('exit', resolveStop);
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    timeout.unref();
  });
}

async function waitFor(url, expectedText, exited, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited()) throw new Error(`${label} exited before serving ${url}`);
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok && (!expectedText || text.includes(expectedText))) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`${label} did not serve ${url} within 60 seconds`);
}

/**
 * Starts the fixture API, the built renderer and the web role's Caddy.
 * `close()` stops all three, and is safe to call after a partial start.
 */
export async function startHarness({ log = () => {} } = {}) {
  const fixture = await startPerformanceFixtureApi({ host: '0.0.0.0' });
  const fixtureAddress = `${CONTAINER_HOST}:${new URL(fixture.url).port}`;
  const containerName = `copalibre-performance-web-${process.pid}`;
  let renderer;
  let caddyStarted = false;

  /*
    A run stopped by a signal never reaches close(): without this, the Caddy
    container outlives it and keeps port 4321, and the next run cannot start.
  */
  const onSignal = (signal) => {
    if (caddyStarted) spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
    renderer?.kill('SIGKILL');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const close = async () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (caddyStarted) await run('docker', ['rm', '--force', containerName]);
    await stop(renderer);
    await fixture.close();
  };

  try {
    const rendererPort = await freePort();
    renderer = spawn(process.execPath, ['apps/web/scripts/serve-with-security-headers.mjs'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOST: '0.0.0.0',
        PORT: String(rendererPort),
        COPALIBRE_API_INTERNAL_URL: fixture.url,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const rendererUrl = `http://127.0.0.1:${rendererPort}`;
    await waitFor(
      `${rendererUrl}${PERFORMANCE_ROUTES[0]}`,
      'Campeonato Panamericano Clubes Senior Varones',
      () => renderer.exitCode !== null,
      'The built renderer',
    );

    const image = await webRoleCaddyImage();
    log(`Serving the built site through deploy/web/Caddyfile in ${image}\n`);
    const started = await run('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--publish',
      `127.0.0.1:${HARNESS_PORT}:${HARNESS_PORT}`,
      '--add-host',
      `${CONTAINER_HOST}:host-gateway`,
      '--pull',
      'missing',
      '--volume',
      `${resolve(projectRoot, 'deploy/web/Caddyfile')}:/etc/caddy/Caddyfile:ro`,
      '--volume',
      `${resolve(projectRoot, 'apps/web/dist/client')}:/srv:ro`,
      '--env',
      `COPALIBRE_WEB_API_UPSTREAM=${fixtureAddress}`,
      '--env',
      `COPALIBRE_WEB_EVENTS_UPSTREAM=${fixtureAddress}`,
      '--env',
      `COPALIBRE_WEB_SSR_UPSTREAM=${CONTAINER_HOST}:${rendererPort}`,
      image,
    ]);
    if (started !== 0) throw new Error(`docker run ${image} failed (exit ${started})`);
    caddyStarted = true;

    const url = `http://127.0.0.1:${HARNESS_PORT}`;
    try {
      await waitFor(
        `${url}${PERFORMANCE_ROUTES[0]}`,
        undefined,
        () => false,
        "The web role's Caddy",
      );
    } catch (error) {
      await new Promise((resolveLogs) =>
        spawn('docker', ['logs', '--tail', '40', containerName], { stdio: 'inherit' }).once(
          'exit',
          resolveLogs,
        ),
      );
      throw error;
    }
    return { url, fixture, close };
  } catch (error) {
    await close();
    throw error;
  }
}
