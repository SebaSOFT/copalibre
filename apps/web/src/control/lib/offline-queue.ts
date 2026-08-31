import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  ControlApiError,
  type ClockAdjustmentRequest,
  type FinalizeMatchRequest,
  type MatchConsoleApiClient,
  type RecordMatchEventRequest,
  type SetMatchRosterRequest,
} from './api-client.js';

/**
 * Every mutating console command the operator can attempt while offline
 * — the durable queue's own record of *what to replay*, not the HTTP
 * request itself. Finalize is included (design.md: "a queued finalize... is
 * refused and surfaced for the operator to resolve explicitly", not
 * excluded from the queue); start/pause/resume are not, since nothing in
 * the console today calls them through a queueable path.
 */
export type QueuedAction =
  | {
      readonly kind: 'clock-adjust';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
      readonly request: ClockAdjustmentRequest;
    }
  | {
      readonly kind: 'timer-resolve';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
      readonly timerId: string;
    }
  | {
      readonly kind: 'record-event';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
      readonly request: RecordMatchEventRequest;
    }
  | {
      readonly kind: 'roster-select';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
      readonly entrantId: string;
      readonly request: SetMatchRosterRequest;
    }
  | {
      readonly kind: 'finalize';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
      readonly request: FinalizeMatchRequest;
    };

export interface QueuedMutation {
  /** The same value as `idempotencyKey` — the natural, already-unique primary key. */
  readonly id: string;
  readonly matchId: string;
  readonly idempotencyKey: string;
  readonly action: QueuedAction;
  /** When the operator first attempted this action, for original-order replay. */
  readonly attemptedAt: number;
  readonly status: 'pending' | 'refused';
  readonly refusalReason?: string;
}

interface OfflineQueueSchema extends DBSchema {
  mutations: {
    key: string;
    value: QueuedMutation;
    indexes: { 'by-match': string };
  };
}

const DB_NAME = 'copalibre-console-offline-queue';
const DB_VERSION = 1;
const STORE = 'mutations';

let dbPromise: Promise<IDBPDatabase<OfflineQueueSchema>> | undefined;

function database(): Promise<IDBPDatabase<OfflineQueueSchema>> {
  dbPromise ??= openDB<OfflineQueueSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('by-match', 'matchId');
    },
  });
  return dbPromise;
}

/** Write-ahead: called before the live send is even attempted (design.md). */
export async function enqueue(
  action: QueuedAction,
  idempotencyKey: string,
  attemptedAt: number,
): Promise<void> {
  const db = await database();
  await db.put(STORE, {
    id: idempotencyKey,
    matchId: action.matchId,
    idempotencyKey,
    action,
    attemptedAt,
    status: 'pending',
  });
}

/** In original attempt order — the sequential-replay requirement (design.md). */
export async function listPending(matchId: string): Promise<readonly QueuedMutation[]> {
  const db = await database();
  const all = await db.getAllFromIndex(STORE, 'by-match', matchId);
  return all.sort((a, b) => a.attemptedAt - b.attemptedAt);
}

/** Every queued mutation across every match — for a global sync-status count. */
export async function listAllPending(): Promise<readonly QueuedMutation[]> {
  const db = await database();
  const all = await db.getAll(STORE);
  return all.sort((a, b) => a.attemptedAt - b.attemptedAt);
}

/** The send succeeded — the queue entry has no further reason to exist. */
export async function markSent(id: string): Promise<void> {
  const db = await database();
  await db.delete(STORE, id);
}

/**
 * The server refused it on replay — the same refusal a live attempt would
 * get. Retained (not removed) so the sync-status UI can show it, but never
 * automatically retried again (design.md, task 2.2).
 */
export async function markRefused(id: string, reason: string): Promise<void> {
  const db = await database();
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, { ...existing, status: 'refused', refusalReason: reason });
}

/** Explicit removal — an operator dismissing a refused item they've seen. */
export async function remove(id: string): Promise<void> {
  const db = await database();
  await db.delete(STORE, id);
}

/** Test-only: drop every stored mutation, across every match. */
export async function clearAll(): Promise<void> {
  const db = await database();
  await db.clear(STORE);
}

export type DrainOutcome =
  | { readonly kind: 'sent'; readonly id: string }
  | { readonly kind: 'refused'; readonly id: string; readonly reason: string }
  | { readonly kind: 'network-failure'; readonly id: string };

/**
 * Sequential, one item at a time, in original order (design.md's "Queue
 * replay order" decision). A refusal marks that one item refused and moves
 * on to the next; a network-level failure stops the whole drain immediately
 * — the caller's own trigger (an `online` event, an SSE reconnect, the
 * periodic fallback) is what schedules the next attempt, not this function
 * retrying internally.
 */
export async function drainQueue(
  client: MatchConsoleApiClient,
  matchId: string,
): Promise<readonly DrainOutcome[]> {
  const pending = await listPending(matchId);
  const outcomes: DrainOutcome[] = [];
  for (const mutation of pending) {
    if (mutation.status === 'refused') continue;
    try {
      await replay(client, mutation);
      await markSent(mutation.id);
      outcomes.push({ kind: 'sent', id: mutation.id });
    } catch (error) {
      if (isRefusal(error)) {
        const reason = error instanceof Error ? error.message : 'Refused';
        await markRefused(mutation.id, reason);
        outcomes.push({ kind: 'refused', id: mutation.id, reason });
        continue;
      }
      outcomes.push({ kind: 'network-failure', id: mutation.id });
      break;
    }
  }
  return outcomes;
}

async function replay(client: MatchConsoleApiClient, mutation: QueuedMutation): Promise<unknown> {
  const { action, idempotencyKey } = mutation;
  switch (action.kind) {
    case 'clock-adjust':
      return client.adjustMatchClock(
        action.organizationAlias,
        action.tournamentAlias,
        action.matchId,
        action.request,
        idempotencyKey,
      );
    case 'timer-resolve':
      return client.resolveMatchTimer(
        action.organizationAlias,
        action.tournamentAlias,
        action.matchId,
        action.timerId,
        idempotencyKey,
      );
    case 'record-event':
      return client.recordMatchEvent(
        action.organizationAlias,
        action.tournamentAlias,
        action.matchId,
        action.request,
        idempotencyKey,
      );
    case 'roster-select':
      return client.setMatchRoster(
        action.organizationAlias,
        action.tournamentAlias,
        action.matchId,
        action.entrantId,
        action.request,
        idempotencyKey,
      );
    case 'finalize':
      return client.finalizeMatch(
        action.organizationAlias,
        action.tournamentAlias,
        action.matchId,
        action.request,
        idempotencyKey,
      );
  }
}

/**
 * A refusal (the server's normal validation rejecting it, same as it would
 * live) versus a network-level failure (no response at all). `ControlApiError`
 * carries a real HTTP status; anything else — a thrown `TypeError` from a
 * failed `fetch`, for instance — is treated as a network failure, since
 * there is no status to distinguish "the server said no" from "no response
 * ever arrived."
 */
function isRefusal(error: unknown): boolean {
  return error instanceof ControlApiError;
}

/**
 * What the operator actually recorded, in one line.
 *
 * A refused item shows its kind and the server's reason, which answers "why was this rejected"
 * but not "what am I about to lose". When the refusal is a series decision — the match was
 * anulled while the operator was offline and will never be played — the contents are the whole
 * point: they are the only way to judge whether the result belongs somewhere else, typically as
 * a correction to an earlier game of the same series. So the queue keeps the item and this
 * renders what is in it.
 *
 * Deliberately structural rather than pretty: entrant and person ids read as ids because that
 * is what the queue durably holds, and inventing names it never stored would be a guess.
 */
export function describeQueuedAction(action: QueuedAction): string {
  switch (action.kind) {
    case 'finalize': {
      const scores = action.request.sides
        .map((side) => `${side.entrantId} ${summariseStatistics(side.statistics)}`)
        .join(' — ');
      const winner =
        action.request.winnerEntrantId === undefined
          ? ''
          : `, winner ${action.request.winnerEntrantId}`;
      return `Final result: ${scores}${winner}`;
    }
    case 'record-event': {
      const who = action.request.personId ?? action.request.side;
      return `Event ${action.request.definitionCode}${who === undefined ? '' : ` for ${who}`}`;
    }
    case 'roster-select':
      return `Roster for ${action.entrantId}: ${action.request.members.length} named`;
    case 'clock-adjust':
      return `Clock set to ${action.request.elapsedSeconds}s`;
    case 'timer-resolve':
      return `Timer ${action.timerId} resolved`;
  }
}

/** Every recorded statistic, in its declared order — no discipline's scoring key is assumed. */
function summariseStatistics(statistics: Record<string, number>): string {
  const entries = Object.entries(statistics);
  if (entries.length === 0) return '(nothing recorded)';
  return entries.map(([code, value]) => `${code} ${value}`).join(' ');
}
