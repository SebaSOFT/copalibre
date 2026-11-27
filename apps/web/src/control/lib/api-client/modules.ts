import type { components } from '@copalibre/contracts';
import type { DisciplineOption, TournamentProfileOption } from '../wizard.js';
import { requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export type InstalledModuleResponse = components['schemas']['InstalledModuleResponse'];

export type OutdatedModuleResponse = components['schemas']['OutdatedModuleResponse'];

export type InstallModuleRequest = components['schemas']['InstallModuleRequest'];

export type InstallModuleResponse = components['schemas']['InstallModuleResponse'];

export type RemoveModuleResponse = components['schemas']['RemoveModuleResponse'];

export type ModuleVerifyResultResponse = components['schemas']['ModuleVerifyResultResponse'];

export type InstalledDisciplineDocumentResponse =
  components['schemas']['InstalledDisciplineDocumentResponse'];

export type AuthoredModuleRequest = components['schemas']['AuthoredModuleRequest'];

export type AuthoredModuleValidationResponse =
  components['schemas']['AuthoredModuleValidationResponse'];

export type AuthoredModuleValidationFailureResponse =
  components['schemas']['AuthoredModuleValidationFailureResponse'];

export type AuthoredModuleSubmitRequest = components['schemas']['AuthoredModuleSubmitRequest'];

export type AuthoredModuleSubmitResponse = components['schemas']['AuthoredModuleSubmitResponse'];

export interface ModulesApi {
  readonly listInstalledModules?: () => Promise<readonly InstalledModuleResponse[]>;

  readonly listOutdatedModules?: () => Promise<readonly OutdatedModuleResponse[]>;

  readonly installModule?: (request: InstallModuleRequest) => Promise<InstallModuleResponse>;

  readonly removeModule?: (alias: string) => Promise<RemoveModuleResponse>;

  readonly verifyModules?: () => Promise<readonly ModuleVerifyResultResponse[]>;

  /** An installed discipline's complete descriptor document, for plain-language display. */
  readonly fetchInstalledDisciplineDocument?: (
    alias: string,
    version?: string,
  ) => Promise<InstalledDisciplineDocumentResponse>;

  /** Validates an authored discipline/profile document without installing it. */
  readonly validateAuthoredModule?: (
    request: AuthoredModuleRequest,
  ) => Promise<AuthoredModuleValidationResponse>;

  /** Packages, validates and installs an authored document, exactly as `installModule` would. */
  readonly installAuthoredModule?: (
    request: AuthoredModuleRequest,
  ) => Promise<InstallModuleResponse>;

  /** Contributes an already-installed authored module upstream. */
  readonly submitAuthoredModule?: (
    request: AuthoredModuleSubmitRequest,
  ) => Promise<AuthoredModuleSubmitResponse>;

  readonly listDisciplines: () => Promise<readonly DisciplineOption[]>;

  readonly listCompatibleProfiles?: (
    descriptorId: string,
    descriptorVersion: string,
    format?: string,
  ) => Promise<readonly TournamentProfileOption[]>;
}

export function modulesEndpoints({ fetch, baseUrl }: EndpointDeps): ModulesApi {
  return {
    listInstalledModules: () =>
      requestJson<readonly InstalledModuleResponse[]>(fetch, `${baseUrl}/admin/modules`),

    listOutdatedModules: () =>
      requestJson<readonly OutdatedModuleResponse[]>(
        fetch,
        `${baseUrl}/admin/modules?outdated=true`,
      ),

    installModule: (body) =>
      requestJson<InstallModuleResponse>(fetch, `${baseUrl}/admin/modules`, {
        method: 'POST',
        body,
      }),

    removeModule: (alias) =>
      requestJson<RemoveModuleResponse>(
        fetch,
        `${baseUrl}/admin/modules/${encodeURIComponent(alias)}`,
        { method: 'DELETE' },
      ),

    verifyModules: () =>
      requestJson<readonly ModuleVerifyResultResponse[]>(fetch, `${baseUrl}/admin/modules/verify`, {
        method: 'POST',
      }),

    fetchInstalledDisciplineDocument: (alias, version) =>
      requestJson<InstalledDisciplineDocumentResponse>(
        fetch,
        `${baseUrl}/admin/modules/${encodeURIComponent(alias)}/document${
          version === undefined ? '' : `?version=${encodeURIComponent(version)}`
        }`,
      ),

    validateAuthoredModule: (body) =>
      requestJson<AuthoredModuleValidationResponse>(
        fetch,
        `${baseUrl}/admin/authored-modules/validate`,
        { method: 'POST', body },
      ),

    installAuthoredModule: (body) =>
      requestJson<InstallModuleResponse>(fetch, `${baseUrl}/admin/authored-modules`, {
        method: 'POST',
        body,
      }),

    submitAuthoredModule: (body) =>
      requestJson<AuthoredModuleSubmitResponse>(fetch, `${baseUrl}/admin/authored-modules/submit`, {
        method: 'POST',
        body,
      }),

    listDisciplines: () =>
      requestJson<readonly DisciplineOption[]>(fetch, `${baseUrl}/disciplines`),

    listCompatibleProfiles: (descriptorId, descriptorVersion, format) => {
      const params = new URLSearchParams({ descriptorId, descriptorVersion });
      if (format !== undefined && format.trim() !== '') params.set('format', format);
      return requestJson<readonly TournamentProfileOption[]>(
        fetch,
        `${baseUrl}/tournament-profiles/compatible?${params}`,
      );
    },
  };
}
