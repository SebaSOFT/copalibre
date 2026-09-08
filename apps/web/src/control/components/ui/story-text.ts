/**
 * Reference strings for the component workbench's stories (OpenSpec 0213).
 *
 * A library component takes its text as a prop, so a story passing a literal
 * renders the same characters in all eight languages and the workbench's
 * language selector does nothing. Every story therefore formats its text from
 * these descriptors instead — real catalogue entries, resolved against whichever
 * catalogue the selector has active (design.md Decision 4).
 *
 * The keys are picked for how far their length actually moves: `save` is
 * "Save" / "Speichern" / "Сохранить" / "保存", a 2-to-9 character spread on the
 * same button. Nothing here is invented for the workbench; every descriptor is
 * one the application already renders somewhere.
 *
 * Not a `.tsx`, deliberately: `ui/` holds components, and the story-coverage
 * check requires a story beside every component in it.
 */
import { messages } from '../../i18n/messages.en.js';

export const storyText = {
  /** Short action word — the widest relative spread across the eight catalogues. */
  save: messages.reviewSaveNationality,
  cancel: messages.matchConsoleCancel,
  /** A nav label: one word in English, compound in German. */
  tournaments: messages.navTournaments,
  /** An ampersand label, which wraps differently once translated. */
  venuesAndOfficials: messages.navResources,
  /** Multi-word titles — where a narrow viewport starts to bite. */
  platformTitle: messages.platformTitle,
  rolesTitle: messages.rolesTitle,
  settingsTitle: messages.settingsTitle,
  reportTitle: messages.reportTitle,
  /** A long action label, the worst case for a button at 188px. */
  savePromotionPlan: messages.promotionSavePlan,
  /** Empty- and loading-state text, which tables and lists need. */
  empty: messages.rolesEmpty,
  loading: messages.reportLoading,
  emptyTitle: messages.landingEmptyTitle,
  /** A confirmation sentence, for toast and alert shapes. */
  saved: messages.orgIdentitySaved,
  dismiss: messages.toastDismiss,
} as const;
