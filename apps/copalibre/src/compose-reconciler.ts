import { chmod, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_DEFAULTS, generateRandomSecret } from './init.js';
import { readInstallationMarker } from './installation-marker.js';

export interface EnvReconciliationResult {
  readonly content: string;
  readonly addedKeys: readonly string[];
  readonly updatedKeys: readonly string[];
}

export interface ComposeReconciliationResult {
  readonly content: string;
  readonly updatedImages: readonly string[];
}

export interface InstallationReconciliationResult {
  readonly envUpdated: boolean;
  readonly composeUpdated: boolean;
  readonly markerUpdated: boolean;
  readonly addedEnvKeys: readonly string[];
  readonly updatedEnvKeys: readonly string[];
  readonly updatedImages: readonly string[];
}

/**
 * Reconciles an existing `.env` file content with a new CopaLibre release version.
 * - Updates `COPALIBRE_IMAGE` and `COPALIBRE_WEB_IMAGE` tags to match `targetVersion`.
 * - Appends newly introduced variables from `defaults` without overwriting existing settings.
 * - Preserves existing comments, custom variables, and formatting.
 */
export function reconcileEnvContent(
  existingContent: string,
  targetVersion: string,
  defaults: Record<string, string> = LOCAL_DEFAULTS,
): EnvReconciliationResult {
  const cleanVersion = targetVersion.replace(/^v/, '');
  const lines = existingContent.split(/\r?\n/);
  const foundKeys = new Set<string>();
  const updatedKeys: string[] = [];

  const updatedLines = lines.map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !match[1] || match[2] === undefined) return line;

    const key = match[1];
    const val = match[2];
    foundKeys.add(key);

    if (key === 'COPALIBRE_VERSION') {
      const inlineComment = /(\s+#.*)$/.exec(val)?.[1] ?? '';
      const configuredVersion = inlineComment ? val.slice(0, -inlineComment.length).trim() : val;
      if (configuredVersion !== cleanVersion) {
        updatedKeys.push(key);
        return `${key}=${cleanVersion}${inlineComment}`;
      }
    }

    if (key === 'COPALIBRE_IMAGE' && val.includes('ghcr.io/sebasoft/copalibre')) {
      const newImg = `ghcr.io/sebasoft/copalibre:${cleanVersion}`;
      if (val !== newImg) {
        updatedKeys.push(key);
        return `${key}=${newImg}`;
      }
    }

    if (key === 'COPALIBRE_WEB_IMAGE' && val.includes('ghcr.io/sebasoft/copalibre-web')) {
      const newImg = `ghcr.io/sebasoft/copalibre-web:${cleanVersion}`;
      if (val !== newImg) {
        updatedKeys.push(key);
        return `${key}=${newImg}`;
      }
    }

    return line;
  });

  const addedKeys: string[] = [];
  const linesToAppend: string[] = [];

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!foundKeys.has(key)) {
      addedKeys.push(key);
      const val = key === 'GARAGE_RPC_SECRET' ? generateRandomSecret(32) : defaultValue;
      linesToAppend.push(`${key}=${val}`);
    }
  }

  if (linesToAppend.length > 0) {
    const lastLine = updatedLines[updatedLines.length - 1];
    if (lastLine !== undefined && lastLine.trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`# Added during upgrade to v${cleanVersion}`, ...linesToAppend);
  }

  const lastUpdated = updatedLines[updatedLines.length - 1];
  const trailingNewline = lastUpdated !== undefined && lastUpdated.endsWith('\n') ? '' : '\n';

  return {
    content: updatedLines.join('\n') + trailingNewline,
    addedKeys,
    updatedKeys,
  };
}

/**
 * Reconciles `docker-compose.yml` to target images while preserving custom volume mappings,
 * ports, environment stanzas, and network overrides.
 */
export function reconcileComposeContent(
  existingContent: string,
  targetVersion: string,
): ComposeReconciliationResult {
  const cleanVersion = targetVersion.replace(/^v/, '');
  const updatedImages: string[] = [];

  // Match: image: ghcr.io/sebasoft/copalibre:1.2.1 or ${COPALIBRE_IMAGE:-ghcr.io/sebasoft/copalibre:1.2.1}
  let updatedContent = existingContent;

  updatedContent = updatedContent.replace(
    /(\$\{COPALIBRE_VERSION:-)([^}]+)(\})/g,
    (_match, prefix: string, _oldVersion: string, suffix: string) =>
      `${prefix}${cleanVersion}${suffix}`,
  );

  const copalibreRegex = /(ghcr\.io\/sebasoft\/copalibre:)([A-Za-z0-9_.-]+)/g;
  updatedContent = updatedContent.replace(copalibreRegex, (_match, prefix, oldTag) => {
    if (oldTag !== cleanVersion) {
      updatedImages.push(`ghcr.io/sebasoft/copalibre:${cleanVersion}`);
    }
    return `${prefix}${cleanVersion}`;
  });

  const copalibreWebRegex = /(ghcr\.io\/sebasoft\/copalibre-web:)([A-Za-z0-9_.-]+)/g;
  updatedContent = updatedContent.replace(copalibreWebRegex, (_match, prefix, oldTag) => {
    if (oldTag !== cleanVersion) {
      updatedImages.push(`ghcr.io/sebasoft/copalibre-web:${cleanVersion}`);
    }
    return `${prefix}${cleanVersion}`;
  });

  return {
    content: updatedContent,
    updatedImages,
  };
}

/**
 * Reconciles an entire CopaLibre installation directory:
 * - Updates `.env`
 * - Updates `docker-compose.yml`
 * - Updates `.copalibre/installation.json`
 */
export async function reconcileInstallationDirectory(
  cwd: string,
  targetVersion: string,
): Promise<InstallationReconciliationResult> {
  const cleanVersion = targetVersion.replace(/^v/, '');
  const envPath = join(cwd, '.env');
  const composePath = join(cwd, 'docker-compose.yml');
  const markerPath = join(cwd, '.copalibre', 'installation.json');

  let envUpdated = false;
  let composeUpdated = false;
  let markerUpdated = false;
  let addedEnvKeys: readonly string[] = [];
  let updatedEnvKeys: readonly string[] = [];
  let updatedImages: readonly string[] = [];

  if (existsSync(envPath)) {
    const rawEnv = await readFile(envPath, 'utf8');
    const envResult = reconcileEnvContent(rawEnv, cleanVersion);
    if (envResult.addedKeys.length > 0 || envResult.updatedKeys.length > 0) {
      await writeFile(envPath, envResult.content, { encoding: 'utf8', mode: 0o600 });
      await chmod(envPath, 0o600);
      envUpdated = true;
    }
    addedEnvKeys = envResult.addedKeys;
    updatedEnvKeys = envResult.updatedKeys;
  }

  if (existsSync(composePath)) {
    const rawCompose = await readFile(composePath, 'utf8');
    const composeResult = reconcileComposeContent(rawCompose, cleanVersion);
    if (composeResult.content !== rawCompose) {
      await writeFile(composePath, composeResult.content, 'utf8');
      composeUpdated = true;
    }
    updatedImages = composeResult.updatedImages;
  }

  const existingMarker = await readInstallationMarker(cwd);
  if (existingMarker) {
    const updatedMarker = {
      ...existingMarker,
      version: cleanVersion,
      upgradedAt: new Date().toISOString(),
    };
    await writeFile(markerPath, `${JSON.stringify(updatedMarker, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(markerPath, 0o600);
    markerUpdated = true;
  }

  return {
    envUpdated,
    composeUpdated,
    markerUpdated,
    addedEnvKeys,
    updatedEnvKeys,
    updatedImages,
  };
}
