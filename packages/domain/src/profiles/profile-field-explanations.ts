/**
 * Execution-time explanations for `TournamentProfileDocument`'s own fields —
 * what the platform does with each declaration, not what an instance of it
 * means. Mirrors `descriptor-field-explanations.ts`'s shape and purpose for
 * the other module kind: the single source both `copalibre_profile_schema`
 * (apps/copalibre's MCP server) and a future published authoring guide read.
 *
 * Pure data: no behavior, no import beyond this file's own types, framework-
 * free like the rest of `packages/domain`.
 *
 * Keyed by dot-path against the schema's own shape; `[]` marks an array
 * whose items are being described, matching
 * `descriptor-field-explanations.ts`'s own convention.
 */
export const PROFILE_FIELD_EXPLANATIONS: Readonly<Record<string, string>> = {
  alias:
    'The catalogue identity used to install and reference this profile (e.g. in `copalibre module add`). Unique together with `version`; never shown to a spectator.',
  version:
    'Semver release identifier. A tournament freezes the profile version it was instantiated from, so publishing a new version never changes the rules of an in-progress competition.',
  name: "The profile's display name, plain string or a locale-keyed object. Shown when choosing a profile to instantiate a tournament from.",
  description: 'A short summary of the profile, shown alongside its name. Optional.',
  attribution: 'Who authored this profile module, where it came from, and under what licence.',
  'attribution.author': 'Who authored this profile module.',
  'attribution.licence':
    'The module\'s licence identifier (e.g. "AGPL-3.0-only", "MIT"). Required for third-party-notices accounting.',
  'attribution.sourceUrl': "Where the module's source is published. Optional.",
  requires:
    'The discipline capabilities this profile needs to run — resolved at binding time against whatever discipline the tournament actually uses, never a fixed discipline version. A profile declares what it needs, not who supplies it.',
  'requires[].capability':
    "The capability name this requirement resolves against at binding time — referenced by `tiebreak[].capability` and by the profile's own scoring/win-condition logic.",
  'requires[].satisfiedBy':
    "Which of the discipline's own statistic/event codes can satisfy this capability. Binding picks the first one the bound discipline actually declares.",
  'requires[].necessity':
    '`required` (binding fails, and the profile cannot be used with that discipline, if unsatisfied) or `optional` (binding proceeds; anything referencing the capability degrades gracefully).',
  'requires[].description':
    'Optional: what this capability represents in competition terms, shown to an operator picking a discipline for this profile.',
  stages:
    "The profile's ordered competition stages — a single round-robin league, or a group stage followed by a knockout bracket. A tournament instantiated from this profile gets exactly this stage sequence unless the instantiating request overrides it.",
  'stages[].number': '1-based order of this stage within the profile.',
  'stages[].name': 'The stage\'s display name (e.g. "Group Stage", "Playoffs").',
  'stages[].format':
    'Which tournament format this stage runs as (`single-elimination`, `round-robin`, `heats`, and so on) — constrains what a tournament instantiated from this profile can do at this stage.',
  'stages[].overrides':
    "Overrides applied to the bound discipline's defaults for this stage only. Optional; absent means the discipline's own defaults apply unchanged.",
  'stages[].allocation':
    "Default seed-order rule for this stage (automatic, manual, or weighted by a named attribute) — carried onto the instantiated tournament's stage configuration unless the instantiating request supplies its own. Optional.",
  points:
    'The match-result point values a tournament instantiated from this profile awards, before any per-discipline scoring input overrides them.',
  'points.win': 'Points awarded to the winning side of a match.',
  'points.draw': 'Points awarded to each side of a drawn match.',
  'points.loss': 'Points awarded to the losing side of a match.',
  tiebreak:
    'The ordered comparator chain standings fall back to when two entrants are level on points — evaluated in array order until one comparator resolves the tie. References capabilities by name, resolved through the same binding `requires` uses, not raw discipline-specific codes.',
  'tiebreak[].capability':
    'Which resolved capability this comparator ranks by — must also appear in `requires` (directly or via one it depends on).',
  'tiebreak[].label': 'Display label for this comparator, shown on the standings table.',
  'tiebreak[].direction':
    '`higher_wins` (the entrant with the larger value ranks ahead) or `lower_wins` (the smaller value ranks ahead — e.g. fewest cards).',
  'tiebreak[].missingValue':
    'How to rank an entrant with no recorded value for this capability: `treat-as-worst` (ranks last on this comparator), `treat-as-zero` (ranks as if it recorded zero), or `invalid` (this comparator is skipped for that entrant, falling through to the next one).',
  'tiebreak[].scope':
    'Which matches this comparator counts: `overall` (every match), `head-to-head` (only matches between the tied entrants), or `match-losses` (a losses-based count). Optional; absent means `overall`.',
  winConditionOverride:
    "A replacement win-condition rule script, permitted only where the bound discipline's field policy marks its own win condition overridable. Optional; absent means the discipline's win condition stands unchanged for tournaments instantiated from this profile.",
};
