import type { ParticipantType } from '../descriptors/discipline-descriptor.js';

export interface Participant {
  readonly personId: string;
  readonly organizationId: string;
  /** Optional public alias (Alias, scope 'participant'), unique within its organization. */
  readonly alias?: string;
  readonly displayName: string;
  readonly type: ParticipantType;
}

export interface Team {
  readonly teamId: string;
  readonly organizationId: string;
  readonly clubId?: string;
  readonly name: string;
}

export type EntrantStatus = 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';

/** A participant's or team's enrollment in one tournament. */
export interface Entrant {
  readonly entrantId: string;
  readonly tournamentId: string;
  readonly entrantRef:
    | { readonly kind: 'person'; readonly personId: string }
    | { readonly kind: 'team'; readonly teamId: string };
  readonly seed?: number;
  readonly status: EntrantStatus;
}
