# help-and-api-docs Specification

## Purpose

Provides self-hosted operators and API integrators with documentation and an interactive,
statically-generated API reference, without depending on a live API fetch at build or runtime and
without shipping an unvalidated pre-1.0 documentation framework unchecked.

## Requirements

### Requirement: Starlight integration is validated by a build-test gate before adoption

The Starlight integration SHALL be validated by an explicit spike with go/no-go criteria (navigation
works, static build succeeds, CSS isolation holds against public/control styling) before any
production documentation content is authored on top of it.

#### Scenario: Spike failure blocks adoption

- **WHEN** the Starlight spike fails any of its go/no-go criteria
- **THEN** production documentation content is not authored on Starlight, and the documented Next.js+Nextra fallback is proposed as a separate change instead

#### Scenario: Spike success unblocks the rest of this capability

- **WHEN** the Starlight spike passes all go/no-go criteria
- **THEN** the remaining `/help/**` and `/help/api-reference/` work in this capability proceeds

### Requirement: OpenAPI reference is a static, versioned artifact

The `/help/api-reference/` route SHALL render from a versioned OpenAPI artifact generated during CI
and copied into the static build, and SHALL NOT fetch a live API at build time or at runtime to
obtain the OpenAPI document.

#### Scenario: Reference works with the API offline

- **WHEN** the documentation site is built and served with no running API instance reachable
- **THEN** `/help/api-reference/` still renders the full reference correctly

### Requirement: Reference renderer runs without a third-party CDN

The `/help/api-reference/` route's rendering UI (the library that renders the OpenAPI artifact into
an interactive reference page) SHALL be served from CopaLibre's own static build, not fetched from a
third-party CDN at runtime, so the page renders correctly on an installation with no internet egress.

#### Scenario: Reference renders with no internet egress

- **WHEN** the documentation site is built and served on a host with no outbound internet access
- **THEN** `/help/api-reference/` still renders the full interactive reference correctly, with no
  failed cross-origin script or stylesheet request

### Requirement: Try It is disabled by default

The interactive API reference's "Try It" request-execution feature SHALL be disabled by default.

#### Scenario: No live request is possible without explicit enablement

- **WHEN** a visitor opens `/help/api-reference/` on a default installation
- **THEN** no mechanism to execute a live API request against any host is available

### Requirement: No secrets or internal hosts in static documentation

Static documentation and the generated OpenAPI artifact SHALL NOT contain access tokens, internal
hostnames, private paths, or production example credentials.

#### Scenario: Generated artifact is free of secrets

- **WHEN** the OpenAPI artifact is generated during CI
- **THEN** a scan for token-shaped strings, internal hostnames, and known credential patterns finds none

### Requirement: Every control-panel screen links to matching contextual help

Each control-panel screen SHALL render a visible link to a Starlight help page that explains that
specific screen's purpose and its key data fields, distinct from a generic link to the help site's
homepage. The link SHALL resolve to the Starlight page in the operator's currently active display
language, using the same locale-prefix routing the help site itself uses for every other page. The page
SHALL describe the screen as it currently behaves; a page describing a surface the screen no longer
presents SHALL be treated as a defect rather than as documentation.

#### Scenario: An operator on the seeding screen reaches seeding-specific help

- **WHEN** an operator viewing the seeding-builder control-panel screen activates its help link
- **THEN** they land on a Starlight page that explains seeding, byes, and the draw constraints this
  screen enforces — not the help site's homepage or an unrelated screen's page

#### Scenario: A screen with no matching help page fails the build

- **WHEN** a control-panel route component is added or changed without a corresponding `helpPath`
  pointing at an existing Starlight page under `/help/control/`
- **THEN** the build fails, naming the missing help path, rather than shipping a silently broken or
  absent help link

#### Scenario: A non-English operator lands on the matching locale's help page

- **WHEN** an operator using the control panel in a language other than English activates a screen's
  help link
- **THEN** they land on that language's Starlight page for the same screen, not the English default

#### Scenario: An English-language operator sees the unprefixed default page

- **WHEN** an operator using the control panel in English activates a screen's help link
- **THEN** they land on the unprefixed default-locale Starlight page

#### Scenario: A page describing a replaced surface is a defect

- **WHEN** a screen's controls change such that its help page describes affordances the screen no longer
  offers
- **THEN** the page is updated in the same change that altered the screen, and the documentation lint
  treats an unclaimed capability as the signal that it was not

### Requirement: Help site documents CLI installation, updating, and every command

The help site SHALL provide a `/help/cli/` section covering how to install CopaLibre, how to update
the framework and its installed modules, and a reference entry for every `copalibre` CLI command —
generated from or checked against the same command-metadata source the CLI's own `--help` output
renders from, so the page cannot silently drift out of sync with the real command set. The updating
page SHALL describe the real, non-destructive upgrade sequence — back up, update the checkout or
image reference, run `upgrade-check` against the target version, then restart — rather than
describing `upgrade-check` as a placeholder with no registered checks.

#### Scenario: Every real CLI command has a reference entry

- **WHEN** a `copalibre` subcommand exists in the CLI's command-metadata source
- **THEN** the `/help/cli/` command reference names it, and a build-time check fails if a command is
  missing from the page or a page entry no longer matches a real command

#### Scenario: An operator finds the update path for modules, not just the framework

- **WHEN** an operator reads the `/help/cli/` updating page
- **THEN** it covers both updating the CopaLibre framework itself and updating installed modules
  (`module list --outdated`, `module add <alias>@<range>`), not only one of the two

#### Scenario: The updating page describes a real, gated upgrade sequence

- **WHEN** an operator reads the `/help/cli/` updating page
- **THEN** it names `copalibre upgrade-check --target-version <version>` as a pre-restart gate against
  module incompatibility, not as an unimplemented placeholder

### Requirement: Help site publishes llms.txt and llms-full.txt

The help site SHALL publish `/llms.txt` (a summary and links to every documentation page) and
`/llms-full.txt` (the same pages' content inlined into one file), generated from the real content
collection at build time so neither can silently list a page that no longer exists or omit one that
does. Both files SHALL contain English content only, regardless of how many other interface languages
the help site supports, so documentation intended for LLM consumption stays in one predictable language
as the site's language coverage grows.

#### Scenario: llms.txt links resolve to real pages

- **WHEN** the help site is built
- **THEN** `/llms.txt` is produced, and every link it contains resolves to a page that exists in the
  built output

#### Scenario: llms-full.txt contains real page content

- **WHEN** the help site is built
- **THEN** `/llms-full.txt` is produced and contains the content of the documentation pages, not a
  hand-maintained summary that could drift from them

#### Scenario: llms-full.txt stays English as more interface languages are added

- **WHEN** the help site is built with content available in multiple interface languages
- **THEN** `/llms-full.txt` contains only the English content, with no page from any other locale
  included

### Requirement: Help site content is available in all eight supported interface languages

The help site's `/help/` content (the overview, the CLI section, and the control-panel section)
SHALL be available in every language in the platform's supported-language contract (English, Spanish,
French, Portuguese, Italian, German, Russian, Mandarin Chinese) as a prefixed Starlight locale, with
English remaining the unprefixed default that `llms.txt`/`llms-full.txt` are generated from. Every
locale SHALL contain the same set of pages as the English default — a build-time check SHALL fail,
naming each missing locale/page pair, when a locale is missing a page English has.

#### Scenario: Every supported language has a reachable help site

- **WHEN** the help site is built
- **THEN** each of the eight supported languages' `/help/` section builds successfully and is
  reachable — English unprefixed, the other seven under their language-code prefix

#### Scenario: Adding a locale never changes what llms.txt/llms-full.txt contain

- **WHEN** a new interface language's help content is added to the site
- **THEN** `/llms.txt` and `/llms-full.txt` continue to reflect English content only

#### Scenario: A locale missing a page fails the build

- **WHEN** an English `/help/**` page exists with no corresponding page under a supported non-English
  locale
- **THEN** the build fails, naming the missing locale and page path, rather than shipping a locale that
  silently falls back to English or 404s for that page

#### Scenario: A new English page requires every locale to add it before the build passes

- **WHEN** a new page is added under the English `/help/**` tree
- **THEN** the build fails for every locale lacking the corresponding translated page, until each adds
  it

### Requirement: Help site documents self-hosting across platforms and deployment topologies

The help site SHALL provide a page explaining how to run CopaLibre from source on Linux, macOS, and
Windows, and how to choose between the two supported deployment topologies — a single-host reverse
proxy at the edge, and Kubernetes via the Helm chart.

#### Scenario: An operator new to CopaLibre finds a self-hosting entry point in the help site

- **WHEN** an operator visits the help site looking for how to install and expose CopaLibre
- **THEN** they find a page, linked from the site's top-level navigation, covering per-platform
  prerequisites, running the stack from source, and both deployment topologies with their own
  prerequisites

#### Scenario: An operator on Windows finds the WSL2 requirement before attempting a bare shell run

- **WHEN** a Windows operator reads the self-hosting page's prerequisites
- **THEN** they are told `./copalibre` requires a POSIX shell and to run it from within WSL2 rather
  than PowerShell or `cmd.exe` directly

### Requirement: The repository README links every living documentation file

`README.md` SHALL contain a Markdown link resolving to every file under `docs/`, excluding
`docs/deployment/evidence/**` (point-in-time audit output, not living documentation), either directly
or via a link to a directory containing it. A build-time check SHALL fail, naming every file it finds
unreachable, when this is not the case.

#### Scenario: A new doc file added without a README link fails the build

- **WHEN** a new file is added under `docs/` (outside `docs/deployment/evidence/`) with no
  corresponding link anywhere in `README.md`
- **THEN** the build fails, naming the orphaned file

#### Scenario: A file reachable only via a linked containing directory passes

- **WHEN** `README.md` links a directory under `docs/` rather than one of its files individually
- **THEN** every file inside that directory is considered reachable

#### Scenario: Evidence files are excluded

- **WHEN** a file exists under `docs/deployment/evidence/`
- **THEN** the check does not require it to be linked from `README.md`

### Requirement: Every shipped capability is documented, not every screen
The help site SHALL carry a page for each accepted capability an operator can exercise, whether or not
that capability has a screen of its own. A capability whose accepted specification declares operator-
facing requirements and which no help page claims to document SHALL fail the documentation lint.

A page SHALL declare the capabilities it documents, so the gate compares the specification against what
the documentation asserts rather than against a filename.

#### Scenario: A capability shipped without documentation fails the gate
- **WHEN** an accepted capability declares operator-facing requirements and no help page claims it
- **THEN** the documentation lint fails, naming the capability and the specification path, rather than
  the site building successfully with the gap in it

#### Scenario: A capability with no operator-facing surface needs no page
- **WHEN** a capability's requirements govern only internal behavior an operator never invokes
- **THEN** it is exempt from the gate without an entry having to be added anywhere to excuse it

#### Scenario: Multi-match series is documented
- **WHEN** an operator looks for how to declare a series, schedule its games, correct one of them, or
  read one on a public bracket
- **THEN** the help site explains each, including what an anulled game means and what happens to a
  result recorded offline against one

#### Scenario: Match-grain scheduling is documented as it currently behaves
- **WHEN** an operator reads the scheduling help
- **THEN** it describes placing a match into a slot, not the venue-and-duration surface that preceded it

### Requirement: A help page states the roles it is written for
Each help page SHALL declare which roles can perform what it describes, and SHALL NOT instruct a reader
to use a control their role cannot reach. Where a task requires a role the reader does not hold, the
page SHALL name the role that can perform it rather than describing the control as if it were available.

#### Scenario: A page names its audience
- **WHEN** a reader opens any help page
- **THEN** the page states which roles the task it describes is available to

#### Scenario: A referee is not told to use an organizer's control
- **WHEN** a page describes a task available only to an organization administrator
- **THEN** it names that role as the one who performs it, rather than presenting the control as
  something any reader can open

#### Scenario: Every role has documentation
- **WHEN** the documentation lint runs
- **THEN** every role in the organization and installation taxonomies is named by at least one page, so
  no role ships with nothing written for it

### Requirement: A declared help path resolves to a real page
A control-panel screen's declared help path SHALL be non-empty and SHALL resolve to an existing help
page. An empty path SHALL fail the build exactly as a missing one does.

#### Scenario: An empty help path fails the build
- **WHEN** a control-panel route declares an empty help path
- **THEN** the build fails naming that route, rather than treating the empty string as an opt-out

#### Scenario: The platform-administration console has help
- **WHEN** a super administrator opens the platform-administration console and activates its help link
- **THEN** they land on a page describing organization creation, module installation and super-admin
  administration

### Requirement: An agent-facing authoring contract is published separately from operator help
The help site SHALL publish an authoring guide addressed to a machine reader, describing the shape and
meaning of a discipline descriptor and a tournament configuration: every field, what it governs while a
competition runs, which sets are closed and why, the win-condition script vocabulary, and the boundary
between what a descriptor fixes and what a tournament ruleset may override.

It SHALL be published with its own retrievable index, distinct from `llms.txt` and `llms-full.txt`, so
an agent can fetch the authoring contract without also fetching the operator-facing documentation. The
existing two files SHALL keep their current scope and content unchanged.

The machine-readable descriptor schema SHALL be served at a stable documentation URL, so an agent can
fetch and validate against the same schema the installation enforces.

Like the existing files intended for machine consumption, the authoring guide and its index SHALL be
English only.

#### Scenario: The authoring index is retrievable on its own
- **WHEN** the help site is built
- **THEN** an authoring index is produced containing the authoring guide's content, and it does not
  contain the operator help pages

#### Scenario: The operator-facing files are unchanged
- **WHEN** the help site is built
- **THEN** `llms.txt` and `llms-full.txt` carry exactly the operator documentation they carried before
  the authoring guide existed

#### Scenario: The schema is fetchable and current
- **WHEN** an agent fetches the published descriptor schema URL
- **THEN** it receives the same schema the installation validates against, generated at build time
  rather than hand-copied

#### Scenario: A field's entry says what it does, not only what it is
- **WHEN** an agent reads the authoring guide's entry for any descriptor field
- **THEN** the entry states what that field causes during a competition, so a regulation's clause can be
  mapped onto it

### Requirement: The authoring guide carries worked transcriptions from real regulations
The authoring guide SHALL include at least two complete transcriptions from published competition
regulations into validating descriptors — one discipline whose matches have two sides and a clock, and
one whose matches produce an ordering rather than a winner — each stating which clause of the regulation
produced which declaration, and which clauses could not be expressed and why.

#### Scenario: Two shapes of competition are worked through
- **WHEN** an agent reads the authoring guide
- **THEN** it finds a full transcription for a two-sided timed discipline and one for a placement
  discipline, not a single example generalized from

#### Scenario: A transcription's output validates
- **WHEN** the descriptor produced by any worked transcription is validated
- **THEN** it passes, so the guide cannot document a mapping the platform would reject

#### Scenario: What could not be expressed is stated
- **WHEN** a regulation contains a rule the descriptor cannot express
- **THEN** the transcription names it and says why, rather than omitting it silently and leaving an
  agent to conclude the mapping was complete
