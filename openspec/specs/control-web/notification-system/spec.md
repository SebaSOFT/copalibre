# control-web/notification-system Specification

## Purpose
Gives every Control-web route one shared, stackable notification surface for reporting the outcome of an
action, replacing the private single-slot `notice` state each route previously kept for itself.

## Requirements

### Requirement: Multiple concurrent messages never overwrite one another
The system SHALL render every active toast message concurrently, stacked, and SHALL NOT let a new
message replace or hide an earlier one still within its display lifetime.

#### Scenario: A second message arrives while the first is still visible
- **WHEN** a route pushes a second toast message before the first has been dismissed or auto-expired
- **THEN** both messages render simultaneously, each independently visible and dismissible

### Requirement: Each message is independently dismissible
Every toast message SHALL offer its own dismiss control, and dismissing one message SHALL NOT affect
any other currently active message.

#### Scenario: Dismissing one toast leaves others untouched
- **WHEN** an operator dismisses one toast out of several currently stacked
- **THEN** only that message is removed; every other active message remains visible unchanged

### Requirement: Severity is typed and error messages require explicit dismissal
Every toast message SHALL declare a severity of at least `success`, `error`, or `info`. `success` and
`info` messages SHALL auto-dismiss after a fixed duration; `error` messages SHALL NOT auto-dismiss and
SHALL remain until the operator explicitly dismisses them.

#### Scenario: An error toast persists until dismissed
- **WHEN** an `error` toast is pushed and the auto-dismiss duration used for `success`/`info` elapses
- **THEN** the error toast remains visible, unaffected by that duration

#### Scenario: A success toast auto-dismisses
- **WHEN** a `success` toast's display duration elapses without the operator dismissing it
- **THEN** the toast is automatically removed

### Requirement: Toast presentation uses the platform's motion and typography tokens
The toast component's enter/exit transitions SHALL use `packages/design-tokens`' motion primitives
(collapsing to negligible duration under `prefers-reduced-motion: reduce`, per the design-tokens
capability's existing reduced-motion requirement), and its text SHALL use the platform's font-size
tokens rather than a component-local size value.

#### Scenario: Reduced motion disables the toast's transition
- **WHEN** a client has `prefers-reduced-motion: reduce` set
- **THEN** a toast's enter/exit renders with negligible animation duration, matching every other
  motion-token-driven component's behavior

### Requirement: An unmapped error still renders a translated message
When a toast is pushed for an error that carries no resolvable translation, the system SHALL render one
generic, translated fallback message rather than an untranslated raw string as the primary text; any raw
diagnostic detail SHALL be available only behind a secondary, explicitly opened affordance.

#### Scenario: An error with no mapped translation shows the generic message
- **WHEN** a toast is pushed for an error code with no corresponding message in the active locale's
  catalog
- **THEN** the toast's primary text is the generic translated fallback message, not the raw error code
  or an untranslated string
