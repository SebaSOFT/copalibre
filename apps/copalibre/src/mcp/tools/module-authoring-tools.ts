import { submitModule, type ModuleKind } from '@copalibre/module-distribution';
import { scaffoldModule } from '../../module-authoring/scaffold.js';
import { validateLocalModule } from '../../module-authoring/validate-local.js';
import { systemProcessRunner } from '../../process-runner.js';
import type { McpToolDefinition } from '../tool.js';

/**
 * The three module-authoring tools scaffold a structurally-valid
 * package, validate it locally, and submit it as a pull request. Always
 * available — no API token, since these operate on the local filesystem and
 * Git, never `apps/api`.
 */
export function moduleAuthoringTools(environment: NodeJS.ProcessEnv): readonly McpToolDefinition[] {
  return [scaffoldTool(), validateLocalTool(environment), submitTool()];
}

function scaffoldTool(): McpToolDefinition {
  return {
    name: 'copalibre_module_scaffold',
    description:
      'Generates a structurally-valid discipline or tournament-profile module package — seeded ' +
      "from one of CopaLibre's own already-valid catalogue documents, not a blind guess at the " +
      'schema — as a tagged local Git repository ready to edit, validate, and submit. Use this ' +
      'first when authoring a new module: it gives real, valid example content (segments, ' +
      'events, statistics for a discipline; stages, points, tiebreak for a profile) to change into ' +
      'the real sport or format, not a blank document. Needs no API token.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['discipline', 'tournament-profile'] },
        alias: { type: 'string' },
        author: { type: 'string' },
        licence: { type: 'string' },
        name: { type: 'string' },
        source_url: { type: 'string' },
        output_directory: { type: 'string' },
      },
      required: ['kind', 'alias'],
    },
    handler: async (args) => {
      const kind = args.kind;
      const alias = args.alias;
      if (kind !== 'discipline' && kind !== 'tournament-profile') {
        throw new Error('kind must be "discipline" or "tournament-profile"');
      }
      if (typeof alias !== 'string' || alias.length === 0) {
        throw new Error('alias must be a non-empty string');
      }
      const result = await scaffoldModule(
        {
          kind: kind as ModuleKind,
          alias,
          author: typeof args.author === 'string' ? args.author : 'Unknown',
          licence: typeof args.licence === 'string' ? args.licence : 'AGPL-3.0-only',
          ...(typeof args.name === 'string' ? { name: args.name } : {}),
          ...(typeof args.source_url === 'string' ? { sourceUrl: args.source_url } : {}),
          outputDirectory:
            typeof args.output_directory === 'string' ? args.output_directory : `modules/${alias}`,
        },
        systemProcessRunner,
      );
      return JSON.stringify(result, null, 2);
    },
  };
}

function validateLocalTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_module_validate_local',
    description:
      'Validates a local module package directory (manifest.json + artifact.json) without ' +
      'fetching or installing anything — the exact same check `copalibre module add`/`module ' +
      'verify` apply. Use it after editing a scaffolded module, before trying to install it ' +
      'locally or submit it. Needs no API token.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    handler: async (args) => {
      const path = args.path;
      if (typeof path !== 'string' || path.length === 0) {
        throw new Error('path must be a non-empty string');
      }
      const version = environment.COPALIBRE_VERSION ?? '0.0.0';
      const result = await validateLocalModule(path, version);
      return result.lines.join('\n');
    },
  };
}

function submitTool(): McpToolDefinition {
  return {
    name: 'copalibre_module_submit',
    description:
      'Forks copalibre-modules, copies a local module package onto a new branch, pushes it, and ' +
      'opens a pull request. Use it once a scaffolded module has been edited and passes ' +
      'copalibre_module_validate_local — this is the last step, handing the module to a human ' +
      'reviewer; it never merges anything itself. Needs no API token, but does need `gh` ' +
      'authenticated with permission to fork the target repository.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        upstream_repository: { type: 'string' },
        base_branch: { type: 'string' },
      },
      required: ['path'],
    },
    handler: async (args) => {
      const path = args.path;
      if (typeof path !== 'string' || path.length === 0) {
        throw new Error('path must be a non-empty string');
      }
      const result = await submitModule({
        modulePath: path,
        ...(typeof args.upstream_repository === 'string'
          ? { upstreamRepository: args.upstream_repository }
          : {}),
        ...(typeof args.base_branch === 'string' ? { baseBranch: args.base_branch } : {}),
      });
      return JSON.stringify(result, null, 2);
    },
  };
}
