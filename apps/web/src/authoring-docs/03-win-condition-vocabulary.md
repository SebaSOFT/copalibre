# Win-condition script vocabulary, and the override boundary

## The win condition is a script, not a field

`winCondition` is not a simple "first to N points" number — it is a Neuron-JS rule script composed
from exactly three core-owned actions. A module composes them; it cannot introduce a fourth action,
because the win-condition vocabulary is core-owned the same way the format list is: a fourth action
would need core-engine support to mean anything, so adding one is a core release, not a module
decision.

### `requireMargin`

Gates the _next_ win action on a minimum lead. Takes one parameter, `margin` (a non-negative number).
Composed before a `winSegment` or `winMatch` action when the regulation requires winning by a margin
("first to 6 games, win by 2").

### `winSegment`

Closes every segment of a named type that currently satisfies its win condition, and credits the
winning side. Parameters: `segment` (the segment type name, matching one declared in `segmentTypes`),
`target` (the unit count needed to close it), and optionally `tiebreakAt`/`tiebreakTarget`/
`tiebreakMargin` for a tiebreak sub-segment (tennis's set-at-6-6 tiebreak is the exercising case).
Segments still in progress stay open and raise threshold events ("one game from the set") that
notification rules can subscribe to.

### `winMatch`

Closes the match itself. `unit` names either a segment type a prior `winSegment` already tallied (so
"first to 2 sets" counts _closed sets_, not games inside them) or a raw per-side statistic total.
`target` is the count needed; when target is absent, the match closes only once regulation is complete
and there is a clear leader — how a field sport with no target score and a possible draw works (leader
wins with a lead, level scores draw).

### Composing them

Football (no segments matter to the win condition — one full-time score decides it):

```json
{
  "id": "football-win-condition",
  "rules": [
    {
      "id": "close-match-rule",
      "type": "simple_rule",
      "options": {},
      "conditions": [],
      "actions": [
        {
          "id": "close-match",
          "type": "winMatch",
          "options": {},
          "params": [
            {
              "id": "unit",
              "name": "unit",
              "type": "simple_string",
              "value": "goals",
              "options": {}
            }
          ]
        }
      ]
    }
  ]
}
```

No `target`: whoever leads on goals at full time takes the match; level sides draw.

Tennis (segments matter — games close sets, sets close the match, margin governs both):

```json
{
  "id": "tennis-best-of-three",
  "rules": [
    {
      "id": "close-set-rule",
      "type": "simple_rule",
      "options": {},
      "conditions": [],
      "actions": [
        {
          "id": "require-set-margin",
          "type": "requireMargin",
          "options": {},
          "params": [
            { "id": "margin", "name": "margin", "type": "simple_number", "value": 2, "options": {} }
          ]
        },
        {
          "id": "close-set",
          "type": "winSegment",
          "options": {},
          "params": [
            {
              "id": "segment",
              "name": "segment",
              "type": "simple_string",
              "value": "set",
              "options": {}
            },
            {
              "id": "target",
              "name": "target",
              "type": "simple_number",
              "value": 6,
              "options": {}
            },
            {
              "id": "tiebreakAt",
              "name": "tiebreakAt",
              "type": "simple_number",
              "value": 6,
              "options": {}
            },
            {
              "id": "tiebreakTarget",
              "name": "tiebreakTarget",
              "type": "simple_number",
              "value": 7,
              "options": {}
            },
            {
              "id": "tiebreakMargin",
              "name": "tiebreakMargin",
              "type": "simple_number",
              "value": 2,
              "options": {}
            }
          ]
        }
      ]
    },
    {
      "id": "close-match-rule",
      "type": "simple_rule",
      "options": {},
      "conditions": [],
      "actions": [
        {
          "id": "close-match",
          "type": "winMatch",
          "options": {},
          "params": [
            {
              "id": "unit",
              "name": "unit",
              "type": "simple_string",
              "value": "set",
              "options": {}
            },
            { "id": "target", "name": "target", "type": "simple_number", "value": 2, "options": {} }
          ]
        }
      ]
    }
  ]
}
```

Win by 2 games to close a set at 6; win 2 sets to close the match.

## The descriptor/ruleset override boundary — `fieldPolicies`

`defaults` is the configuration tree a discipline declares (scoring points, registration defaults,
tiebreaker order, anything discipline-specific). `fieldPolicies` is a per-dot-path contract over that
tree, and it is the whole answer to "what can a tournament change, and how carefully":

- **`permission`** — `inherited` (a tournament may not touch it, it flows through unchanged),
  `replaced` (a tournament may set its own value outright), `merged` with a named strategy
  (`append-list`, `union-list`, `shallow-object` — how the tournament's value combines with the
  discipline's rather than replacing it), or `forbidden` (a tournament may never override it, full
  stop, stronger than `inherited`).
- **`mutationClass`** — how hard-to-reverse _changing_ the field is once a tournament exists: `safe`
  (no side effects), `requires_rebuild` (changing it invalidates and regenerates already-generated
  fixtures — reported, never silently rebuilt), or `blocked_after_results` (unavailable once a valid
  result exists against it; the only remaining path is the audited correction workflow).

A regulation clause that says "the federation may adjust points-per-win per competition" becomes a
`replaced`/`safe` (or `replaced`/`blocked_after_results`, if changing it mid-competition would be
incoherent) field policy on `scoring.pointsPerWin`. A clause that is structural to the sport itself —
"a match has two 45-minute halves, always" — is either not exposed in `fieldPolicies` at all (nothing
about it is overridable) or given `permission: { kind: 'forbidden' }` if the same dot-path is exposed
for a _different_ reason (read, not write). This is a design decision every field needs, not a default
to leave unset: a field present in `defaults` with no entry in `fieldPolicies` is a validation gap, not
a safe absence.
