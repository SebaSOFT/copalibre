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
  /**
   * What this side plays (0015). The **discipline**, not a pinned module
   * version: a club's football team plays football whichever descriptor version
   * a given tournament froze. Without it, a club fielding a football and a
   * futsal side has two rows the model cannot tell apart — and a roster
   * constraint has no team to attach to.
   *
   * Absent on a team registered before the discipline was asked for.
   */
  readonly disciplineId?: string;
  /**
   * Overrides the club's short label (0037).
   *
   * One club fields two sides in one tournament, and `TLL A` / `TLL B` is the
   * only thing telling a spectator which one is on the court. Absent means the
   * club's answers for it.
   */
  readonly abbreviation?: string;
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
