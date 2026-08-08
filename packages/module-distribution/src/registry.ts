import {
  RulesRegistry,
  registerCopalibreVocabulary,
  registerWinConditionVocabulary,
} from '@copalibre/rules';

/**
 * The vocabulary a discipline's `winCondition`/`notificationRuleCapabilities`
 * and a profile's `winConditionOverride` may reference — no app currently
 * assembles one runtime registry (each package registers its own slice for
 * its own evaluation path), so this composes exactly what a descriptor/
 * profile's own script fields can reach: the base CopaLibre vocabulary
 * (conditions, declared-effect actions) plus the win-condition actions
 * (`requireMargin`, `winSegment`, `winMatch`) `winCondition` scripts use.
 * Constraint-vocabulary (draw rejection/require) is deliberately excluded —
 * it is a different rule surface (the draw engine's), never referenced by a
 * discipline or profile document.
 */
export function buildValidationRegistry(): RulesRegistry {
  const registry = new RulesRegistry();
  registerCopalibreVocabulary(registry);
  registerWinConditionVocabulary(registry);
  return registry;
}
