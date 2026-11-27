/**
 * Formatters for the administrative activity feed and audit trail.
 *
 * Relative-time formatting used to live here (`formatRelativeTime`); it now
 * lives in `components/ui/atoms/ResponsiveTimestamp.tsx`'s `relative` format,
 * which `ActivityLog.tsx` renders through directly.
 *
 * Resolves through the platform's canonical `resolveLabel`/`LocalizedLabel`
 * rather than a bespoke `{es, en}` pair — both dictionaries
 * used to only distinguish Spanish from an English-for-everything-else
 * fallback, silently rendering English for the other 6 supported languages.
 */

import { isSupportedLanguage, resolveLabel, type LocalizedLabel } from '@copalibre/domain';
import { ACTION_DESCRIPTIONS } from './activity-action-descriptions.ts';
import { REASON_DESCRIPTIONS } from './activity-reason-descriptions.ts';

export const ACTIVITY_ACTION_CODES = Object.freeze(Object.keys(ACTION_DESCRIPTIONS));

const UNKNOWN_ACTION: LocalizedLabel = {
  en: 'Other activity',
  es: 'Otra actividad',
  fr: 'Autre activité',
  pt: 'Outra atividade',
  it: 'Altra attività',
  de: 'Weitere Aktivität',
  ru: 'Другое действие',
  zh: '其他操作',
};

const SYSTEM_ACTOR: LocalizedLabel = {
  en: 'System',
  es: 'Sistema',
  fr: 'Système',
  pt: 'Sistema',
  it: 'Sistema',
  de: 'System',
  ru: 'Система',
  zh: '系统',
};

const DEMO_DATASET_ACTOR: LocalizedLabel = {
  en: 'Demo dataset loader',
  es: 'Carga del conjunto de demostración',
  fr: 'Chargement du jeu de démonstration',
  pt: 'Carga do conjunto de demonstração',
  it: 'Caricamento dei dati dimostrativi',
  de: 'Laden des Demodatensatzes',
  ru: 'Загрузка демонстрационного набора',
  zh: '演示数据集加载器',
};

const USER_ACTOR: LocalizedLabel = {
  en: 'User',
  es: 'Usuario',
  fr: 'Utilisateur',
  pt: 'Usuário',
  it: 'Utente',
  de: 'Person',
  ru: 'Пользователь',
  zh: '用户',
};

/**
 * Returns a human-readable, localized description of an audit refusal reason.
 */
export function formatActivityReason(reason: string | undefined, locale = 'es'): string {
  if (!reason) return '';
  const language = isSupportedLanguage(locale) ? locale : 'en';
  const exactMatch = REASON_DESCRIPTIONS[reason];
  if (exactMatch) {
    return resolveLabel(exactMatch, language);
  }

  // Prefix match for parameterized reasons (e.g. "Token is missing required scope: ...")
  for (const [key, label] of Object.entries(REASON_DESCRIPTIONS)) {
    if (reason.startsWith(key)) {
      return resolveLabel(label, language);
    }
  }

  return reason;
}

/**
 * Returns a human-readable, localized description of an audit event action.
 */
export function formatActivityAction(action: string, locale = 'es'): string {
  const language = isSupportedLanguage(locale) ? locale : 'en';
  const normalized = action.toLowerCase().replaceAll('_', '-');
  const match = ACTION_DESCRIPTIONS[action] ?? ACTION_DESCRIPTIONS[normalized];
  if (match) {
    return resolveLabel(match, language);
  }
  return resolveLabel(UNKNOWN_ACTION, language);
}

export interface GroupableActivity {
  readonly auditId: string;
  readonly action: string;
  readonly actor: string;
  readonly occurredAt: string;
}

export interface ActivityGroup<T extends GroupableActivity> {
  readonly id: string;
  readonly latest: T;
  readonly entries: readonly T[];
}

/** Collapses only consecutive entries with the same action and actor in one five-minute window. */
export function groupConsecutiveActivity<T extends GroupableActivity>(
  entries: readonly T[],
  windowMilliseconds = 5 * 60 * 1000,
): readonly ActivityGroup<T>[] {
  const groups: { id: string; latest: T; entries: T[] }[] = [];

  for (const entry of entries) {
    const previousGroup = groups[groups.length - 1];
    const firstInGroup = previousGroup?.entries[0];
    const distance =
      firstInGroup === undefined
        ? Number.POSITIVE_INFINITY
        : Date.parse(firstInGroup.occurredAt) - Date.parse(entry.occurredAt);
    const belongsToPrevious =
      previousGroup !== undefined &&
      firstInGroup !== undefined &&
      entry.action === firstInGroup.action &&
      entry.actor === firstInGroup.actor &&
      distance >= 0 &&
      distance <= windowMilliseconds;

    if (belongsToPrevious) {
      previousGroup.entries.push(entry);
      continue;
    }

    groups.push({ id: entry.auditId, latest: entry, entries: [entry] });
  }

  return groups;
}

/** Resolve technical actor identifiers to a role label; only known people retain their email. */
export function formatActivityActor(actor: string, locale = 'es'): string {
  const language = isSupportedLanguage(locale) ? locale : 'en';
  if (actor === 'system:demo-dataset') return resolveLabel(DEMO_DATASET_ACTOR, language);
  if (actor.startsWith('system:')) return resolveLabel(SYSTEM_ACTOR, language);
  if (actor.startsWith('user:') || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actor)) {
    return resolveLabel(USER_ACTOR, language);
  }
  return actor.includes('@') ? actor : resolveLabel(SYSTEM_ACTOR, language);
}
