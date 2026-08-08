import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModuleManifest } from '../manifest.js';

export const VALID_ATTRIBUTION = { author: 'Test Author', licence: 'AGPL-3.0-only' };

export function validManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    kind: 'discipline',
    alias: 'orbital-frisbee',
    version: '1.0.0',
    attribution: VALID_ATTRIBUTION,
    requiresCopalibre: '>=0.0.0',
    assets: [],
    ...overrides,
  };
}

export function validDisciplineDocument(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    alias: 'orbital-frisbee',
    version: '1.0.0',
    name: 'Orbital Frisbee',
    attribution: VALID_ATTRIBUTION,
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 3, maxPlayers: 7 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    winCondition: { id: 'wc', rules: [] },
    defaults: {},
    fieldPolicies: {},
    ...overrides,
  };
}

export function validProfileDocument(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    alias: 'weekend-cup',
    version: '1.0.0',
    name: 'Weekend Cup',
    attribution: VALID_ATTRIBUTION,
    requires: [{ capability: 'primary-scoring', satisfiedBy: ['points'], necessity: 'required' }],
    stages: [{ number: 1, name: 'League', format: 'round-robin' }],
    points: { win: 3, draw: 1, loss: 0 },
    tiebreak: [],
    ...overrides,
  };
}

export async function makeModuleDirectory(manifest: unknown, artifact: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-'));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'artifact.json'), JSON.stringify(artifact));
  return directory;
}
