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
language, using the same locale-prefix routing the help site itself uses for every other page.

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
