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
  });

  describe('reconcileComposeContent', () => {
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
