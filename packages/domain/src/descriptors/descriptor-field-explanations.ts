/**
 * Execution-time explanations for `DisciplineDescriptor`'s own fields — what
 * the platform does with each declaration, not what an instance of it means
 * (that is 0161's per-instance `description`, declared by a module on its
 * own statistics/events/formats). This is the single source both
 * `copalibre_descriptor_schema` (apps/copalibre's MCP server) and the
 * published authoring guide read, so an agent fetching either gets the same
 * text (openspec 0163, design.md "The guide drifts from the schema").
 *
 * Pure data: no behavior, no import beyond this file's own types, framework-
 * free like the rest of `packages/domain`.
 *
 * Keyed by dot-path against the schema's own shape; `[]` marks an array
 * whose items are being described, matching how `descriptor-schema.ts`'s
 * `fieldOf()` already reports a validation error's path.
 */
export const DESCRIPTOR_FIELD_EXPLANATIONS: Readonly<Record<string, string>> = {
  alias:
    'The catalogue identity used to install and reference this discipline (e.g. in `copalibre module add`). Unique together with `version`; never shown to a spectator.',
  version:
    'Semver release identifier. A tournament freezes the descriptor version it was created with, so publishing a new version never changes the rules of an in-progress competition.',
  name: "The discipline's display name, plain string or a locale-keyed object. Shown in the discipline picker.",
  description:
    'A short summary of the discipline, shown alongside its name in the discipline picker. Optional.',
  images:
    'One to ten object-storage references for background art shown behind the discipline in the picker. Optional; a discipline with none renders with no image.',
  attribution: 'Who authored this discipline module, where it came from, and under what licence.',
  'attribution.author': 'Who authored this discipline module.',
  'attribution.licence':
    'The module\'s licence identifier (e.g. "AGPL-3.0-only", "MIT"). Required for third-party-notices accounting.',
  'attribution.sourceUrl': "Where the module's source is published. Optional.",
  participantTypes:
    'Which kinds of entrant this discipline supports: `individual`, `team`, or both. Constrains what a tournament using it may register.',
  rosterConstraints:
    'The size limits a match roster must satisfy for this discipline — floor, ceiling, and substitute allowance.',
  'rosterConstraints.minPlayers':
    'The fewest players a roster may field and still be valid for a match.',
  'rosterConstraints.maxPlayers':
    'The most players who may be on a match roster at once (on the field/court/table together), not the squad size.',
  'rosterConstraints.maxSubstitutes':
    'How many additional players beyond `maxPlayers` a squad may name as available substitutes. Optional; absent means unlimited.',
  'rosterConstraints.allowMidTournamentChanges':
    'Whether a team may add or remove squad members after the tournament has started. Optional; absent means no.',
  segmentTypes:
    'The named subdivisions a match can be played in (a half, a set, a frame) — never a closed platform enum, always discipline-declared. An event definition names which segment types it may be recorded during.',
  'segmentTypes[].name':
    "The segment type's stable identifier, referenced by event definitions and the win condition script.",
  'segmentTypes[].label': 'Display label for the segment type.',
  'segmentTypes[].timed':
    'Whether this segment runs against a clock (a half) or is played to a target with no clock (a set, a frame). Drives whether the live console shows a timer for it.',
  'segmentTypes[].defaultDurationSeconds':
    "The segment's regulation length in seconds, for timed segments. Optional; a tournament ruleset may override it.",
  eventDefinitions:
    "The vocabulary of things that can be recorded during a match (a goal, a card, a point). Each is offered on the live console's event palette and may declare explicit effects on score, statistics, tags, or match state — never inferred from its `category`.",
  'eventDefinitions[].code':
    'Stable identifier for the event, referenced by effects, collectors, and workflow options elsewhere in the descriptor.',
  'eventDefinitions[].label': "Display label offered on the live console's event palette.",
  'eventDefinitions[].description':
    'Optional: what recording this event does, in competition terms — shown to the operator recording it. Absent renders the label alone.',
  'eventDefinitions[].category':
    'One of `positive`, `negative`, `neutral` — drives presentation only (which colour, which grouping). Never implies a score or statistic effect; those are declared explicitly in `effects`.',
  'eventDefinitions[].permittedSegmentTypes':
    "Which of the discipline's `segmentTypes` this event may be recorded during. The console refuses recording it outside those segments.",
  'eventDefinitions[].actorRequirement':
    'Whether recording this event requires naming a person (`person`), a side (`side`), either (`person-or-staff`), or nobody (`none`).',
  'eventDefinitions[].payloadSchema':
    "A JSON Schema for this event's payload. Fields not declared here are refused at recording time — an event's payload is closed by its own schema, not open JSON.",
  'eventDefinitions[].effects':
    'Explicit, typed consequences of recording this event: score change, statistic delta, timed penalty, match-state transition, or a tag applied/lifted. Absent or empty means recording it changes nothing derived.',
  'eventDefinitions[].personPayloadFields':
    "Payload fields that name a person but carry no effect of their own (e.g. a substitution's outgoing/incoming player) — declared so the console still prompts for a person there.",
  'eventDefinitions[].workflow':
    'An optional data-driven branch the console resolves before the recorded fact is final — e.g. "foul" branching into play-on / free-kick / penalty / card, each itself a declared event.',
  statistics:
    'The accounting vocabulary this discipline declares — every number standings and tables can be built from. Codes are unique: two statistics named `points` would make fold order decide a table.',
  'statistics[].code': 'Stable identifier, referenced by effects, collectors, and table columns.',
  'statistics[].label': 'Display label.',
  'statistics[].aggregation':
    'How repeated values fold into a total: `sum` (add), `count` (how many times recorded), `max`/`min` (the extreme value), `average`. Chosen per statistic — goals are `sum`, a fastest-lap time might be `min`.',
  'statistics[].description':
    'Optional: what this statistic counts, in competition terms. Absent renders no explanation.',
  scoringInputs:
    'The inputs a tournament\'s scoring configuration may reference by code — e.g. "goals" for a football win/draw/loss points table. `event-derived` inputs come from recorded events; `operator-entered` ones are typed in directly (a judged placement, say).',
  'scoringInputs[].code': "Stable identifier, referenced by a tournament's scoring configuration.",
  'scoringInputs[].label': 'Display label.',
  'scoringInputs[].source':
    '`event-derived` (computed from recorded events) or `operator-entered` (typed in directly).',
  'scoringInputs[].description':
    'Optional: what this input does to the score, in competition terms.',
  availableFormats:
    "The subset of the platform's supported tournament formats (`single-elimination`, `double-elimination`, `round-robin`, `league`, `round-robin-single-leg`, `round-robin-home-away`, `bracket-groups`, `gauntlet`, `swiss`, `custom-bracket`, `free-for-all`, `heats`, `ffa-bracket`, `ffa-bracket-groups`, `ffa-league`) this discipline supports. A tournament using this discipline may only choose from what is listed here.",
  formatDescriptions:
    "Optional: the discipline's own explanation of a format it lists in `availableFormats`, keyed by format. Absent for a format falls back to the platform's own catalogued description.",
  placementScoring:
    'For a placement discipline (using `free-for-all`, `heats`, `ffa-bracket`, `ffa-bracket-groups`, or `ffa-league`): the finishing-position-to-points table, and which declared statistic the points are recorded under. Absent for a discipline that never places.',
  'placementScoring.statisticCode':
    'Which declared statistic the placement points are recorded as.',
  'placementScoring.table': 'The finishing-position → points mapping, 1-based.',
  'placementScoring.beyondTable':
    'Points for a finishing position the table does not name. Defaults to 0.',
  collectors:
    'Declared aggregations over the competition and actor hierarchies — the layer that answers "how many goals has this player scored across the tournament", not just "in this match". Absent means the discipline answers no statistic question beyond what a single result records.',
  tags: "Labels a person, team or other granularity may carry over time — suspended, under review, captain. A collector's `requiresTag` names one declared here; the tournament decides what carrying a tag means, the platform never refuses on account of one.",
  rosterRoles:
    "Tactical/positional roles a match roster member may carry — goalkeeper, captain, designated hitter. Never a core-hardcoded enum. A `roster-role-snapshot` effect's `role` and a roster member's `roles` both resolve against codes declared here.",
  'rosterRoles[].code': 'Stable identifier for the role.',
  'rosterRoles[].label': 'Display label.',
  'rosterRoles[].badge':
    'Short console badge text (e.g. "GK", "C"). Falls back to `code` when absent.',
  tableLayouts:
    'The standard tables and rankings this discipline declares — group standings, top scorers, and the like. A tournament ruleset may replace this set entirely via `fieldPolicies["tableLayouts"]`.',
  notificationRuleCapabilities:
    'Stable identifiers naming which notification-rule capabilities (from the core-owned registry) this discipline permits a tournament to configure custom scripts against.',
  winCondition:
    'A Neuron-JS rule script, composed from the three core-owned win-condition actions (`requireMargin`, `winSegment`, `winMatch`) — see the win-condition vocabulary section of this guide. Determines when and how a match closes and who wins it.',
  series:
    'Optional default series configuration for competitions under this discipline — a tournament may still declare its own per the same shape. Absent means matches default to being settled by a single result.',
  'series.span':
    'How many matches a series can play. A `best-of` span must be odd, so a majority is always possible.',
  'series.resolutionClass':
    'How the matches of a series combine into one result: `best-of` (first to a majority of match wins), `aggregate` (summed score across every match), `points-per-leg` (each match awards its own points, summed). Mutually exclusive with `resolutionScript`.',
  'series.resolutionScript':
    'A custom Neuron-JS script deciding the series instead of a built-in `resolutionClass`. Mutually exclusive with `resolutionClass`; exactly one of the two must be declared when `series` is present.',
  'series.neutralGround': 'Whether the series is played with no side recorded as host. Optional.',
  'series.standingsAccounting':
    '`match` (default — every game of the series adds its own result to standings) or `series` (the whole series adds one result, however many games it took).',
  uiMetadata:
    'Presentation hints for editors and consoles — participant-type labels, named win-condition presets. Never behavior; never read by validation or accounting.',
  defaults:
    "The configuration tree a tournament's overrides act on — scoring, registration defaults, tiebreakers, and any discipline-specific structure. Shape is discipline-defined; `fieldPolicies` governs which dot-paths within it a tournament may replace.",
  fieldPolicies:
    "Per-dot-path contract over `defaults`: whether a tournament may replace/merge/inherit a field (`permission`), and how hard-to-reverse changing it is (`mutationClass`: `safe`, `requires_rebuild`, or `blocked_after_results`). This is the descriptor/ruleset override boundary — see this guide's dedicated section.",
};
