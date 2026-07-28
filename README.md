# CopaLibre

> **Open-source tournament management for clubs, leagues, federations, and competitive communities.**

CopaLibre is a planned self-hosted tournament-management system for organizations that run real competitions with many teams, clubs, athletes, officials, and public audiences.

It is being designed for sports and esports where the bracket is only one part of the operation: registrations, eligibility, fixtures, schedules, results, standings, discipline rules, audit history, and public competition coverage must work as one trustworthy system.

[License](#license) · [Product direction](#product-direction) · [Competition scope](#competition-scope) · [Design direction](#design-direction) · [Roadmap](#roadmap)

> [!IMPORTANT]
> CopaLibre is in **product design and technical planning**. It contains no application code yet. The current goal is to establish a sound, independently designed foundation before implementation starts.

## Why CopaLibre

Tournament operations often end up split between spreadsheets, chat groups, bracket tools, manual scoreboards, and separate public pages. That creates avoidable errors, unclear result authority, and poor visibility for teams and audiences.

CopaLibre is intended to give organizers control of the full competition lifecycle while keeping ownership of their data and deployment:

- **Self-hosted by default.** Run CopaLibre on infrastructure you control.
- **Open by design.** The project uses a network-copyleft license so improvements to publicly offered modified versions remain available to their users.
- **Operations before novelty.** Reliable fixtures, results, standings, scheduling, permissions, and auditability come before marketplace or advertising features.
- **Multi-discipline, not sport-shaped.** The domain must model the real differences between team sports, esports, combat sports, tennis, and chess without forcing every competition into the same template.
- **Public competition coverage.** Spectators need clear schedules, live outcomes, standings, and brackets without access to operator controls.

## Product direction

CopaLibre is aimed at organizations that manage multiple teams and clubs, including:

- local and regional clubs;
- amateur and semi-professional leagues;
- federations and associations;
- schools, universities, and community competitions;
- esports organizers and competitive communities;
- tournament operators running in-person, hybrid, or online events.

The first product focus is a trustworthy **self-hosted live-operations system**, not a global tournament-discovery network, payment marketplace, or proprietary game-integration platform.

### Core product principles

1. **Authoritative competition facts** — results, schedules, eligibility, and configuration changes must have an authorized actor and traceable history.
2. **Deterministic competition logic** — the same approved rules, placements, and match facts must produce the same fixtures, standings, and advancement outcomes.
3. **Explainable rankings** — standings must expose the inputs and tiebreak rule that determined each position.
4. **Audited corrections** — an approved correction supersedes a fact rather than silently overwriting history, and shows its impact before it is applied.
5. **Configurable discipline rules** — sport and game differences belong in versioned, validated configuration instead of scattered hard-coded exceptions.
6. **Public/private separation** — public competition surfaces expose only explicitly published information; operational notes and permissions remain private.
7. **Portable deployment** — the system must be practical to deploy on a conventional self-hosted Linux environment and adaptable to managed hosting where its runtime requirements are met.

## Competition scope

CopaLibre is being designed around these initial discipline families. They are planning inputs, not a claim that every format is already supported.

| Discipline family | Candidate disciplines | Competition concerns to model |
| --- | --- | --- |
| Team field and court sports | Football, futsal, volleyball, basketball | Rosters, substitutions, periods, fixtures, home/away, points tables, tie rules, venues, referee workflows |
| Esports | Rocket League, VALORANT, League of Legends, Fortnite, Warzone, PUBG | Team or player entrants, best-of series, maps/games, score aggregation, FFA placement, lobbies, evidence and dispute workflows |
| Combat sports | Karate and other martial arts, boxing | Categories, divisions, weigh-ins or eligibility requirements, bouts, judges, decision methods, medal progression |
| Racket sports | Tennis | Singles/doubles, draws, seeds, sets, courts, score entry, ranking and event formats |
| Mind sports | Chess | Individual entrants, Swiss and round-robin pairing, colour assignment, results, standings, rating inputs such as Elo |

### Format selection is a design track

CopaLibre will not treat all sports as bracket variants. The format catalogue must be selected after mapping discipline requirements and edge cases.

The candidate set under evaluation includes:

- single and double elimination;
- round robin and league play;
- single-leg and home-and-away leagues;
- group stage plus playoffs;
- Swiss systems;
- free-for-all and placement-based stages;
- seeded draws, pools, divisions, weight classes, and qualification stages;
- individual and team competition models.

Every selected format needs a clear state model, deterministic fixture generation, testable advancement rules, and an auditable correction policy before it becomes a product commitment.

## What CopaLibre is not

- It is **not** a clone, fork, visual imitation, or compatibility promise for Toornament or any other tournament platform.
- It will not copy competitor source code, proprietary UI, branding, icons, screenshots, help text, assets, or undocumented implementation details.
- It is not currently a payments, ticketing, prize-distribution, advertising, sponsorship-marketplace, streaming-hosting, or global discovery product.
- It is not ready for production use.

CopaLibre is an independent product shaped by tournament-domain research, organizer needs, and openly documented market behavior.

## Design direction

CopaLibre should feel like a **sports broadcast product**, not a generic gray administration panel.

The intended visual language combines the pace and hierarchy of live sports coverage with the clarity required for dense operational workflows:

- bold score, status, schedule, and ranking hierarchy;
- energetic but disciplined colour systems for live, final, delayed, disputed, and scheduled states;
- responsive public views that support spectators, teams, and clubs;
- focused operator surfaces that reduce noise when staff must act quickly;
- sport- and discipline-aware presentation without hard-coding one sport's visual language into the platform.

Design research inputs include ESPN-style sports broadcasting and the competitive UI language seen in Rocket League, VALORANT, and *THE FINALS*. The following references are inspiration for information hierarchy, motion, atmosphere, and presentation—not assets or layouts to reproduce:

- [Gaming Streaming Website UI/UX Design](https://www.behance.net/gallery/249140375/Gaming-Streaming-Website-UIUX-Design?tracking_source=search_projects%7Cesports%2Bui&l=3)
- [Generación F — ESPN](https://www.behance.net/gallery/185628925/Generacion-F-ESPN)
- [Esports Tournament Platform UI/UX Case Study](https://www.behance.net/gallery/253265427/Esports-Tournament-Platform-UIUX-Case-Study)
- [VALORANT Fan Web Project](https://www.behance.net/gallery/206041869/Valorant-Fan-Web-Project)

## Deployment direction

CopaLibre is self-hosted first. The deployment design will prioritize an understandable path for organizations that need data ownership and operational independence.

The planning baseline is:

- a documented Linux deployment path with Docker Compose;
- explicit persistent-data backup and restore procedures;
- no mandatory CopaLibre-hosted account for core tournament workflows;
- a deployment model that can later be adapted to managed services and free or paid hosting layers, including Vercel, Appify, and comparable providers where their execution, storage, database, realtime, and background-work constraints are satisfied;
- architecture decisions made from operational requirements rather than provider branding.

No provider-specific deployment is committed yet.

## Planned capabilities

The design baseline currently evaluates these capabilities:

| Area | Planned outcome |
| --- | --- |
| Organization and access | Clubs, leagues, federations, projects, scoped roles, and auditable permissions |
| Tournament authoring | Competition metadata, discipline configuration, ruleset versions, registrations, and visibility policy |
| Entrants | Individuals, teams, rosters, clubs, eligibility, check-in, seeds, and placements |
| Competition engine | Stages, groups, rounds, fixtures, brackets, standings, schedules, results, advancement, and discipline-aware calculation |
| Live operations | Official match control, result authority, correction workflows, disputes where selected, and operational queues |
| Public coverage | Tournament overview, schedules, structures, matches, participants, results, standings, rules, and shareable public pages |
| Data ownership | Reviewed imports, stable identifiers, exports, backup, restore, and portable deployment |
| Auditability | Versioned configuration, actor/time/reason history, explainable standings, and correction impact traces |

## Project status

| Area | Status |
| --- | --- |
| Product identity | Defined: **CopaLibre** |
| License | Defined: **GNU Affero General Public License v3.0** |
| Product direction | In design |
| Discipline and format catalogue | Under evaluation |
| Domain model and state machine | Planned |
| Architecture and deployment contract | Planned |
| Visual system | Research and direction established; design system pending |
| Application code | Not started |
| Production deployment | Not started |

## Roadmap

The project is intentionally in a design-first phase.

1. **Discipline and format mapping** — compare the required rules, participants, scoring, tiebreakers, progression, and operational workflows across the target sports and esports.
2. **Core domain design** — define organizations, clubs, teams, participants, tournaments, rulesets, stages, fixtures, matches, facts, standings, corrections, and audit records.
3. **Competition-state contract** — specify legal state transitions, locks, result authority, correction impact, and reproducible calculations.
4. **Architecture and deployment design** — establish the self-hosted baseline, data boundaries, backup/restore, public projection, security model, and hosting trade-offs.
5. **Sport-broadcast design system** — turn the visual research into independently designed tokens, components, layouts, accessibility rules, and responsive public/operator patterns.
6. **Implementation plan** — convert accepted decisions into scoped issues, data contracts, acceptance criteria, fixtures, and test strategy before application code begins.

## Documentation and participation

The repository will grow its documentation alongside the design. Before implementation, contributors will have clear references for:

- product scope and non-goals;
- supported disciplines and competition formats;
- domain model and state transitions;
- architecture and deployment decisions;
- visual design system and accessibility standards;
- contribution, code-of-conduct, security, and release policies.

Until those documents exist, please use GitHub Issues and Discussions for questions, design proposals, and feedback. Do not begin implementation work from an assumption or from competitor behavior alone.

## Open-source research influences

The README structure follows useful patterns observed in mature open-source products: a clear promise and status signal, feature/domain map, self-hosting posture, documentation and contribution routes, and explicit licensing.

Examples reviewed for this initial structure include [Nextcloud](https://github.com/nextcloud/server), [OpenProject](https://github.com/opf/openproject), [Plane](https://github.com/makeplane/plane), [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat), [Mattermost](https://github.com/mattermost/mattermost), [ERPNext](https://github.com/frappe/erpnext), [Appwrite](https://github.com/appwrite/appwrite), [Supabase](https://github.com/supabase/supabase), [Outline](https://github.com/outline/outline), and [Actual](https://github.com/actualbudget/actual). Tournament-domain README references were also reviewed: [TMX](https://github.com/CourtHive/TMX) and [osu! tournament manager](https://github.com/kibotrel/osu-tournament-manager).

## License

CopaLibre is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you modify CopaLibre and offer the modified version for use over a network, AGPL-3.0 requires that users of that modified version can receive its corresponding source code. Read the full license text before distributing or deploying modified versions.

## Name

**CopaLibre** combines the language of competition with the project’s open, self-hosted, community-oriented direction. The name, logo, wordmark, and visual identity are still under design.
