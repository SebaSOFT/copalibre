import type { SupportedLanguage } from '@copalibre/domain';
import { SCHEDULE_PRESET_REASONS, emailCopy, type SchedulePresetReason } from './email-copy.js';
import type { EmailContent } from './email-layout.js';
import { actorPrincipalId } from './recipients.js';

/** Rows one email lists before pointing at the programme for the rest. */
export const RESCHEDULE_ROW_CAP = 50;

export interface SchedulePlacementSummary {
  readonly startsAt: number;
  readonly venue: { readonly alias: string; readonly name: string } | null;
}

/** One published placement a batch changed or withdrew, as `schedule.published` carries it. */
export interface ScheduleChange {
  readonly matchId: string;
  readonly tournamentId: string;
  readonly previous: SchedulePlacementSummary;
  readonly next: SchedulePlacementSummary | null;
  readonly withdrawn: boolean;
  readonly reason: { readonly code?: string; readonly text: string };
}

/** What the email says about a match, resolved at send time. */
export interface RescheduledMatch {
  readonly label: string;
  readonly tournament: { readonly alias: string; readonly name: string };
  /** Clubs of the decided entrants' teams or persons; an undecided side contributes none. */
  readonly clubIds: readonly string[];
}

/** An active assignment that may receive a reschedule email. */
export interface RescheduleAssignment {
  readonly email: string;
  readonly principalId: string;
  readonly role: string;
  readonly clubId: string | null;
  readonly tournamentId: string | null;
}

/**
 * Who hears about which changes: each change goes to the `club-admin` assignments of its match's
 * clubs and the `tournament-admin` assignments of its tournament. The actor is left out, and an
 * address held through several assignments is one recipient, compared case-insensitively.
 */
export function rescheduleRecipients(
  changes: readonly ScheduleChange[],
  matches: ReadonlyMap<string, RescheduledMatch>,
  assignments: readonly RescheduleAssignment[],
  actor: unknown,
): ReadonlyMap<string, readonly ScheduleChange[]> {
  const actorId = actorPrincipalId(actor);
  const recipients = new Map<string, { address: string; changes: ScheduleChange[] }>();
  for (const change of changes) {
    const clubIds = new Set(matches.get(change.matchId)?.clubIds ?? []);
    for (const assignment of assignments) {
      if (actorId !== undefined && assignment.principalId === actorId) continue;
      const concerned =
        (assignment.role === 'club-admin' &&
          assignment.clubId !== null &&
          clubIds.has(assignment.clubId)) ||
        (assignment.role === 'tournament-admin' && assignment.tournamentId === change.tournamentId);
      const address = assignment.email.trim();
      if (!concerned || address === '') continue;
      const key = address.toLowerCase();
      const entry = recipients.get(key) ?? { address, changes: [] };
      if (!entry.changes.includes(change)) entry.changes.push(change);
      recipients.set(key, entry);
    }
  }
  return new Map(
    [...recipients.values()]
      .sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase(), 'en'))
      .map((entry) => [entry.address, entry.changes]),
  );
}

/**
 * One recipient's digest: their changed matches grouped under the reason that applies to each, a
 * preset reason worded in the email's language and a typed one as written, capped at
 * {@link RESCHEDULE_ROW_CAP} rows with a pointer to the programme for the rest.
 */
export function rescheduleEmailContent(input: {
  readonly language: SupportedLanguage;
  readonly timeZone: string;
  readonly changes: readonly ScheduleChange[];
  readonly matches: ReadonlyMap<string, RescheduledMatch>;
  readonly programmeUrl: string;
}): Pick<EmailContent, 'subject' | 'heading' | 'paragraphs' | 'action'> {
  const copy = emailCopy(input.language).reschedule;
  const when = new Intl.DateTimeFormat(input.language, {
    timeZone: input.timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const placement = (summary: SchedulePlacementSummary) => {
    const at = when.format(summary.startsAt);
    return summary.venue === null ? at : copy.at(at, summary.venue.name);
  };
  const reasonOf = (change: ScheduleChange): string => {
    const code = change.reason.code;
    if (code !== undefined && (SCHEDULE_PRESET_REASONS as readonly string[]).includes(code))
      return copy.presets[code as SchedulePresetReason];
    return change.reason.text.trim() === '' ? copy.noReason : change.reason.text.trim();
  };

  const groups = new Map<string, ScheduleChange[]>();
  for (const change of input.changes) {
    const reason = reasonOf(change);
    groups.set(reason, [...(groups.get(reason) ?? []), change]);
  }

  const paragraphs = [copy.intro(input.changes.length)];
  let listed = 0;
  for (const [reason, changes] of groups) {
    if (listed >= RESCHEDULE_ROW_CAP) break;
    paragraphs.push(copy.reason(reason));
    for (const change of changes) {
      if (listed >= RESCHEDULE_ROW_CAP) break;
      const match = input.matches.get(change.matchId)?.label ?? copy.undecided;
      paragraphs.push(
        change.withdrawn || change.next === null
          ? copy.withdrawn(match, placement(change.previous))
          : copy.moved(match, placement(change.previous), placement(change.next)),
      );
      listed += 1;
    }
  }
  if (input.changes.length > listed) paragraphs.push(copy.more(input.changes.length - listed));

  const tournaments = new Set(
    input.changes.map((change) => input.matches.get(change.matchId)?.tournament.name),
  );
  const [only] = tournaments;
  return {
    subject:
      tournaments.size === 1 && only !== undefined ? copy.subject(only) : copy.subjectSeveral,
    heading: copy.heading,
    paragraphs,
    action: { label: copy.action, url: input.programmeUrl },
  };
}

/** The well-formed changes of a payload; an older event without them has none. */
export function changesOf(value: unknown): readonly ScheduleChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (change): change is ScheduleChange =>
      typeof change === 'object' &&
      change !== null &&
      typeof (change as ScheduleChange).matchId === 'string' &&
      typeof (change as ScheduleChange).tournamentId === 'string' &&
      typeof (change as ScheduleChange).previous?.startsAt === 'number',
  );
}
