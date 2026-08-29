# CopaLibre discipline-authoring guide

This is the target artifact for an agent turning a sport's regulations into a CopaLibre discipline
module — a `DisciplineDescriptor` document. It is written for a machine reader, not an operator: it
explains the schema's own shape and what each declaration governs at execution time, not where to
click in a control panel. The operator-facing help site (`llms.txt`, `llms-full.txt`) is a different
document with a different audience; this one is retrieved separately, at `/llms-authoring.txt`.

## What CopaLibre does not do here

This guide, and the two MCP tools beside it (`copalibre_descriptor_schema`,
`copalibre_descriptor_validate`), never read a PDF, extract clauses, or author a descriptor. That is
the calling agent's own retrieval — this guide only makes the destination legible and the validator
honest. A descriptor that validates is coherent; it is not automatically a faithful transcription of
the regulation it came from. Judging fidelity is the agent's job, informed by the "what could not be
expressed" section each worked transcription below carries.

## How to use this guide

1. **Fetch the schema.** `copalibre_descriptor_schema` (no arguments) returns the exact JSON Schema
   `copalibre_descriptor_validate` and installation both check against, together with a field-by-field
   explanation of what each declaration does — the same explanations this guide's reference section
   renders. The schema is also served on its own at a stable URL:
   `/schemas/discipline-descriptor.schema.json`.
2. **Read the reference sections below** for the parts a schema alone does not explain: why a set is
   closed and what to do when a regulation needs something outside it, the win-condition script
   vocabulary, and the descriptor/tournament override boundary.
3. **Read a worked transcription** close in shape to the sport being authored — a two-sided timed
   discipline (basketball) or a placement discipline with no two sides and no clock (a track sprint).
   Generalizing from an example beats generalizing from a field list, because the hard part is not
   "what fields exist" but "which regulation clause becomes which declaration".
4. **Draft the descriptor, then validate it.** `copalibre_descriptor_validate` takes `{ "descriptor":
<object> }` and returns `{ "ok": true }` or `{ "ok": false, "error": "...", "field": "<dot-path>" }`
   — the exact validator the installation applies, called directly, not restated. Iterate: propose,
   validate, revise.
5. **Scaffold, validate locally, and submit** with the module-authoring MCP tools
   (`copalibre_module_scaffold`, `copalibre_module_validate_local`, `copalibre_module_submit`), which
   this guide does not repeat — see the MCP server's own `instructions`.

## Sections in this guide

- [Descriptor reference](/authoring/descriptor-reference/) — every field, what it governs, its
  constraints.
- [Closed sets](/authoring/closed-sets/) — formats, resolution classes, aggregation modes, result
  reasons: why each is closed, and what to do when a regulation needs something outside it.
- [Win-condition vocabulary and the override boundary](/authoring/win-condition-vocabulary/) — the
  three-action script vocabulary a win condition composes, and which fields a tournament ruleset may
  override versus which a discipline fixes.
- [Worked transcription: basketball](/authoring/transcription-basketball/) — a two-sided, timed,
  segment-based discipline, end to end.
- [Worked transcription: a track sprint](/authoring/transcription-track-sprint/) — a placement
  discipline with no two sides and no clock, end to end.
