import {
  type DisciplineDescriptor,
  type HookScriptAttachment,
  type OverrideSet,
} from '@copalibre/domain';
import type { EventOrigin } from '../../outbox.js';

export interface CreateTournamentInput {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly descriptor: DisciplineDescriptor;
  readonly profile?: { readonly profileId: string; readonly version: string };
  readonly includesMinors?: boolean;
  readonly showYouthProfiles?: boolean;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly origin?: EventOrigin;
}

export interface CreateRulesetInput {
  readonly tournamentId: string;
  readonly organizationId: string;
  readonly descriptor: DisciplineDescriptor;
  readonly overrides: OverrideSet;
  readonly customScripts?: readonly HookScriptAttachment[];
  readonly actor: string;
  readonly authorizationContext: string;
  readonly reason?: string;
}
