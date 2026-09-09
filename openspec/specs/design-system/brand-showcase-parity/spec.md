# design-system/brand-showcase-parity Specification

## Purpose
Provides signature visual identity components, tactical coordinate grid styling, ambient glow tokens, and showcase cards matching the `copalibre.app` tournament operations showcase, bringing the live implementation into parity with the advertised brand.

## Requirements

### Requirement: Signature Asymmetric Chamfer Geometry Without Clip-Path
The design system SHALL provide asymmetric chamfer styling for cards, frames, buttons, and pills using `corner-shape: bevel` and `border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size)` cutting exclusively the Top-Right and Bottom-Left corners. The chamfer implementation SHALL NOT utilize `clip-path` masks, preserving external borders, outlines, box-shadow glows, and accessibility focus rings intact.

#### Scenario: Chamfer cuts Top-Right and Bottom-Left corners without clipping box-shadow
- **WHEN** any element carrying `.cl-chamfer` or `.cl-image-frame` is rendered
- **THEN** its top-right and bottom-left corners are cut at 45° via `corner-shape: bevel`, its top-left and bottom-right corners remain 90° square, and outer box shadows or focus rings remain unclipped

### Requirement: Ambient Cyan Glow and Tactical Coordinate Grid Tokens
The design token system SHALL declare an ambient electric cyan glow token (`--cl-glow-cyan`) and provide a `.cl-tactical-grid` background utility rendering subtle dark cyan coordinate lines across hero and tournament bracket surfaces.

#### Scenario: Tactical grid utility renders coordinate grid
- **WHEN** `.cl-tactical-grid` is applied to a layout container
- **THEN** it renders a dark blueprint coordinate grid using subtle dark cyan linear gradients without hardcoded pixel colors

#### Scenario: Primary interactive controls emit ambient cyan glow
- **WHEN** a primary action button or active live indicator receives hover or keyboard focus
- **THEN** it renders the `--cl-glow-cyan` ambient box-shadow glow

### Requirement: LiveMatchScorecard Component
The component library SHALL provide a `LiveMatchScorecard` component presenting a match overview matching the showcase layout: tactical status header with live dot (`● CANCHA 1 • OPERACIONES EN VIVO`), match clock with live status indicator (`● 78:48`), central monospace score box (`[ 3 : 1 ]` in JetBrains Mono with tabular figures), team color swatches (`■`), goal event banner with VAR confirmation tag, and a Standings Comparator Trace callout with an electric cyan left accent rail.

#### Scenario: Scorecard renders central monospace score box and comparator trace
- **WHEN** `LiveMatchScorecard` renders a live match with an active comparator trace
- **THEN** the score appears in a high-contrast central box with tabular figures, and the comparator trace displays with a solid cyan left accent rail and step counter

### Requirement: TiebreakerSequence Component
The component library SHALL provide a `TiebreakerSequence` molecule rendering the sequential pipeline of tiebreaker rules (`[1. Total Points] -> [2. Head-to-Head Goal Diff (Triggered)] -> ...`), highlighting triggered rules with an electric cyan border, cyan text, and dark background.

#### Scenario: Triggered tiebreaker rule is visually emphasized
- **WHEN** a tiebreaker rule in `TiebreakerSequence` is marked as triggered
- **THEN** its badge renders in electric cyan with a 1px border, while non-triggered rules render in muted dark panel styling

### Requirement: AuditLogCard with Diff Formatting
The component library SHALL provide an `AuditLogCard` organism rendering event audit trails with color-coded vertical event rails (amber for corrections, slate for standard events), score diff blocks (`- Score: 1 - 1`, `+ Score: 2 - 1`), and an automated recalculation latency pulse tag.

#### Scenario: Corrected event renders score diff and amber accent rail
- **WHEN** an audit event represents a score correction
- **THEN** it renders with an amber left rail, green for added score text, red for removed score text, and execution latency in milliseconds

### Requirement: DisciplineCard Component
The component library SHALL provide a `DisciplineCard` component featuring a chamfered 4:5 image frame, a `[FONDO DISPONIBLE]` badge, a `[DISCIPLINE]` pill, display title, attribute pills for formats, participants, segments, events, and statistics, and an embedded copyable terminal CLI install command.

#### Scenario: Discipline card presents attribute pills and terminal command
- **WHEN** `DisciplineCard` renders a tournament discipline
- **THEN** its media frame carries the beveled chamfer, format attributes render in dark navy pills, and the installation command renders with a one-click copy button

### Requirement: TerminalBlock Component
The component library SHALL provide a `TerminalBlock` atom rendering code and CLI snippets with macOS-style window dots (red, yellow, green), a file/terminal title header, syntax-highlighted code output, and a clipboard copy action.

#### Scenario: Terminal block displays window controls and copies command
- **WHEN** `TerminalBlock` is rendered with a shell command
- **THEN** it renders three colored window dots, command prompt styling, and clicking the copy button copies the command to the clipboard
