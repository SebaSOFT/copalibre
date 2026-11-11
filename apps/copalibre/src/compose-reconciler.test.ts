import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reconcileComposeContent,
  reconcileEnvContent,
  reconcileInstallationDirectory,
} from './compose-reconciler.js';
import { writeInstallationMarker } from './installation-marker.js';

describe('compose-reconciler', () => {
  describe('reconcileEnvContent', () => {
    it('updates image tags while preserving user values and comments', () => {
      const existing = `# Custom configuration
POSTGRES_USER=myuser
POSTGRES_PASSWORD=supersecret
COPALIBRE_PORT=9090
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.1
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.1
`;
      const result = reconcileEnvContent(existing, '1.3.0', {
        POSTGRES_USER: 'copalibre',
        NEW_SETTING: 'default_val',
      });

      expect(result.updatedKeys).toEqual(['COPALIBRE_IMAGE', 'COPALIBRE_WEB_IMAGE']);
      expect(result.addedKeys).toEqual(['NEW_SETTING']);
      expect(result.content).toContain('POSTGRES_USER=myuser');
      expect(result.content).toContain('POSTGRES_PASSWORD=supersecret');
      expect(result.content).toContain('COPALIBRE_PORT=9090');
      expect(result.content).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.3.0');
      expect(result.content).toContain('COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.3.0');
      expect(result.content).toContain('NEW_SETTING=default_val');
    });

    it.each([
      ['https://copa.example', 'true'],
      ['http://localhost:8080', 'true'],
      ['http://192.168.1.10:8080', 'false'],
    ])(
      'adds COPALIBRE_SESSION_COOKIE_SECURE derived from COPALIBRE_APP_URL=%s',
      (appUrl, expected) => {
        const result = reconcileEnvContent(`COPALIBRE_APP_URL=${appUrl}\n`, '1.3.0', {
          COPALIBRE_SESSION_COOKIE_SECURE: 'true',
        });

        expect(result.addedKeys).toEqual(['COPALIBRE_SESSION_COOKIE_SECURE']);
        expect(result.addedSessionCookieSecure).toBe(expected);
        expect(result.content).toContain(`COPALIBRE_SESSION_COOKIE_SECURE=${expected}`);
      },
    );

    it('adds the session cookie setting once and leaves an existing value alone', () => {
      const defaults = { COPALIBRE_SESSION_COOKIE_SECURE: 'true' };
      const first = reconcileEnvContent('COPALIBRE_APP_URL=http://10.0.0.5\n', '1.3.0', defaults);
      const second = reconcileEnvContent(first.content, '1.3.0', defaults);

      expect(second.addedKeys).toEqual([]);
      expect(second.addedSessionCookieSecure).toBeUndefined();
      expect(second.content.match(/COPALIBRE_SESSION_COOKIE_SECURE=/g)).toHaveLength(1);
    });

    it('falls back to the default when COPALIBRE_APP_URL is missing or unusable', () => {
      const defaults = { COPALIBRE_SESSION_COOKIE_SECURE: 'true' };
      expect(reconcileEnvContent('', '1.3.0', defaults).addedSessionCookieSecure).toBe('true');
      expect(
        reconcileEnvContent('COPALIBRE_APP_URL=not a url\n', '1.3.0', defaults)
          .addedSessionCookieSecure,
      ).toBe('true');
    });

    it('updates COPALIBRE_VERSION to the requested release', () => {
      const result = reconcileEnvContent(
        'COPALIBRE_VERSION=1.2.5 # set by deployment automation',
        'v1.3.0',
        {},
      );

      expect(result.updatedKeys).toEqual(['COPALIBRE_VERSION']);
      expect(result.content).toBe('COPALIBRE_VERSION=1.3.0 # set by deployment automation\n');
    });

    it('generates random secret for GARAGE_RPC_SECRET if newly added', () => {
      const existing = 'COPALIBRE_PORT=8080\n';
      const result = reconcileEnvContent(existing, '1.3.0', {
        GARAGE_RPC_SECRET: 'placeholder',
      });

      expect(result.addedKeys).toContain('GARAGE_RPC_SECRET');
      expect(result.content).toMatch(/GARAGE_RPC_SECRET=[0-9a-f]{64}/);
    });

    it('adds the two database passwords as distinct random secrets when missing', () => {
      const result = reconcileEnvContent('COPALIBRE_PORT=8080\n', '1.3.0');

      expect(result.addedKeys).toEqual(
        expect.arrayContaining([
          'COPALIBRE_DATABASE_OWNER_PASSWORD',
          'COPALIBRE_DATABASE_APP_PASSWORD',
        ]),
      );
      const owner = /^COPALIBRE_DATABASE_OWNER_PASSWORD=([0-9a-f]{64})$/m.exec(result.content)?.[1];
      const app = /^COPALIBRE_DATABASE_APP_PASSWORD=([0-9a-f]{64})$/m.exec(result.content)?.[1];
      expect(owner).toBeDefined();
      expect(app).toBeDefined();
      expect(owner).not.toBe(app);
    });

    it('never overwrites database passwords an installation already has', () => {
      const existing =
        'COPALIBRE_DATABASE_OWNER_PASSWORD=kept-owner\nCOPALIBRE_DATABASE_APP_PASSWORD=kept-app\n';
      const result = reconcileEnvContent(existing, '1.3.0');

      expect(result.addedKeys).not.toContain('COPALIBRE_DATABASE_OWNER_PASSWORD');
      expect(result.addedKeys).not.toContain('COPALIBRE_DATABASE_APP_PASSWORD');
      expect(result.content).toContain('COPALIBRE_DATABASE_OWNER_PASSWORD=kept-owner\n');
      expect(result.content).toContain('COPALIBRE_DATABASE_APP_PASSWORD=kept-app\n');
      expect(result.content.match(/COPALIBRE_DATABASE_APP_PASSWORD=/g)).toHaveLength(1);
    });
  });

  describe('reconcileComposeContent', () => {
    it('reports a compose file without the database-setup service, and leaves it to the operator', () => {
      const legacy = 'services:\n  migrate:\n    image: ghcr.io/sebasoft/copalibre:1.2.1\n';
      const result = reconcileComposeContent(legacy, '1.4.0');
      expect(result.lacksDatabaseRoles).toBe(true);
      expect(result.content).not.toContain('database-setup');

      const shipped = `${legacy}  database-setup:\n    image: ghcr.io/sebasoft/copalibre:1.2.1\n`;
      expect(reconcileComposeContent(shipped, '1.4.0').lacksDatabaseRoles).toBe(false);
    });

    it('finds the database-setup service in the shipped docker-compose.yml', async () => {
      const { readFile } = await import('node:fs/promises');
      const shipped = await readFile(
        new URL('../../../docker-compose.yml', import.meta.url),
        'utf8',
      );
      expect(reconcileComposeContent(shipped, '1.4.0').lacksDatabaseRoles).toBe(false);
    });

    it('updates image tags in compose content while preserving custom volumes and ports', () => {
      const composeYaml = `services:
  api:
    image: \${COPALIBRE_IMAGE:-ghcr.io/sebasoft/copalibre:1.2.1}
    ports:
      - "8888:3001"
    volumes:
      - ./custom-volume:/var/custom:ro
      - ./modules:/var/lib/copalibre/modules:ro

  web:
    image: ghcr.io/sebasoft/copalibre-web:1.2.1
    ports:
      - "4444:4321"
`;

      const result = reconcileComposeContent(composeYaml, 'v1.4.0');
      expect(result.updatedImages).toContain('ghcr.io/sebasoft/copalibre:1.4.0');
      expect(result.updatedImages).toContain('ghcr.io/sebasoft/copalibre-web:1.4.0');
      expect(result.content).toContain('ghcr.io/sebasoft/copalibre:1.4.0');
      expect(result.content).toContain('ghcr.io/sebasoft/copalibre-web:1.4.0');
      // Preserved overrides
      expect(result.content).toContain('"8888:3001"');
      expect(result.content).toContain('./custom-volume:/var/custom:ro');
      expect(result.content).toContain('"4444:4321"');
    });

    it('updates COPALIBRE_VERSION interpolation defaults', () => {
      const composeYaml = [
        'services:',
        '  api:',
        '    labels:',
        '      version: copalibre-${COPALIBRE_VERSION:-1.2.5}',
      ].join('\n');

      const result = reconcileComposeContent(composeYaml, 'v1.3.0');

      expect(result.content).toContain('copalibre-${COPALIBRE_VERSION:-1.3.0}');
    });

    it('moves the shipped internal port mappings to 127.0.0.1 and leaves the gateway alone', () => {
      const composeYaml = [
        'services:',
        '  api:',
        '    ports:',
        "      - '3001:3001'",
        '  object-storage:',
        '    ports:',
        '      - "9000:3900"',
        '  clamd:',
        '    ports:',
        '      - 3310:3310',
        '  gateway:',
        '    ports:',
        "      - '${COPALIBRE_PORT:-8080}:80'",
        '',
      ].join('\n');

      const result = reconcileComposeContent(composeYaml, 'v1.3.0');

      expect(result.loopbackPorts).toEqual(['3001:3001', '9000:3900', '3310:3310']);
      expect(result.content).toContain("- '127.0.0.1:3001:3001'");
      expect(result.content).toContain('- "127.0.0.1:9000:3900"');
      expect(result.content).toContain("- '127.0.0.1:3310:3310'");
      expect(result.content).toContain("- '${COPALIBRE_PORT:-8080}:80'");
    });

    it('is idempotent once the ports are on loopback', () => {
      const once = reconcileComposeContent("    ports:\n      - '3002:3002'\n", 'v1.3.0');
      const twice = reconcileComposeContent(once.content, 'v1.3.0');
      expect(twice.content).toBe(once.content);
      expect(twice.loopbackPorts).toEqual([]);
    });

    it('ships a compose file that publishes only the gateway on every interface', async () => {
      const { readFile } = await import('node:fs/promises');
      const shipped = await readFile(
        new URL('../../../docker-compose.yml', import.meta.url),
        'utf8',
      );
      const published = [...shipped.matchAll(/^\s*-\s*['"]?([^'"\s]+:\d+)['"]?\s*$/gm)]
        .map((match) => match[1] ?? '')
        .filter((mapping) => /^(\$\{[^}]+\}|[\d.]+:)?\d+:\d+$|^\$\{[^}]+\}:\d+$/.test(mapping));
      const everyInterface = published.filter((mapping) => !mapping.startsWith('127.0.0.1:'));
      expect(everyInterface).toEqual(['${COPALIBRE_PORT:-8080}:80']);
      expect(reconcileComposeContent(shipped, 'v9.9.9').loopbackPorts).toEqual([]);
    });
  });

  describe('reconcileInstallationDirectory', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'reconcile-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('updates .env, docker-compose.yml, and installation marker', async () => {
      await writeInstallationMarker(tempDir, '1.2.1');
      await writeFile(
        join(tempDir, '.env'),
        'COPALIBRE_PORT=8080\nCOPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.1\n',
      );
      await writeFile(
        join(tempDir, 'docker-compose.yml'),
        'services:\n  api:\n    image: ghcr.io/sebasoft/copalibre:1.2.1\n',
      );

      const result = await reconcileInstallationDirectory(tempDir, '1.3.0');
      expect(result.envUpdated).toBe(true);
      expect(result.composeUpdated).toBe(true);
      expect(result.markerUpdated).toBe(true);

      const updatedEnv = await readFile(join(tempDir, '.env'), 'utf8');
      expect(updatedEnv).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.3.0');

      const updatedCompose = await readFile(join(tempDir, 'docker-compose.yml'), 'utf8');
      expect(updatedCompose).toContain('image: ghcr.io/sebasoft/copalibre:1.3.0');

      const updatedMarker = JSON.parse(
        await readFile(join(tempDir, '.copalibre', 'installation.json'), 'utf8'),
      );
      expect(updatedMarker.version).toBe('1.3.0');
    });
  });
});
