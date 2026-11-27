# design-system/design-review-evidence Specification

## Purpose
How a closing design review records findings: against the design contract, merged into root causes, and proposed as small changes for the owner to select.

## Requirements

### Requirement: A design review records findings against the design contract

A design review report under `docs/reviews/` SHALL give each finding these fields:
- the page or route;
- the widths and languages checked;
- a severity: blocker, major or minor;
- the `DESIGN.md` section it violates, or the label "contract gap";
- the skill that raised it;
- the atomic level that owns the fix;
- a screenshot path;
- the change that will fix it.

A skill heuristic that `DESIGN.md` overrules SHALL be recorded as "contract holds", not as a defect.

#### Scenario: A finding without a contract section is a contract gap

- **WHEN** a reviewer records a finding that no `DESIGN.md` section covers
- **THEN** the finding is labelled "contract gap" and routed to a follow-up of the contract change, not
  to a fix change

#### Scenario: A deliberate brand choice is not a defect

- **WHEN** a generic-UI heuristic flags tracked uppercase labels, mono data labels, middle-dot meta
  strings, or the single cyan accent on ink
- **THEN** the report records "contract holds" for it and no fix change is assigned

### Requirement: Findings merge into root causes that map to surgical follow-ups

Findings that share an owning component SHALL be merged into one root cause. One root cause SHALL map
to one follow-up change.

#### Scenario: A repeated symptom is one root cause

- **WHEN** the same defect appears on several pages and traces to one shared component
- **THEN** the report merges the findings into one root cause at that component's atomic level, and
  assigns one follow-up change

### Requirement: The review capture covers the agreed matrix and reports overflow

`scripts/design-review-capture.mjs` SHALL capture every in-scope page in Spanish and German at the
widths of its surface:
- Public, 404, Help and auth screens at 375, 768, 1024 and 1440 px;
- Control at 768, 1024 and 1440 px;
- TV at 1280 and 1920 px.

It SHALL write an overflow report listing every page whose body or any element scrolls horizontally.
Phone-width pages in that list SHALL then also be captured at 188px in all eight languages.

#### Scenario: An overflowing page gets the extended pass

- **WHEN** the first pass reports horizontal overflow on a public page at 375px in German
- **THEN** the script captures that page at 188px in all eight interface languages

#### Scenario: Control is not captured at phone width

- **WHEN** the script expands a Control route
- **THEN** it captures 768, 1024 and 1440 px, and does not capture 375px or 188px

#### Scenario: Clean pages are not over-captured

- **WHEN** a page has no overflow in the first pass
- **THEN** it is not captured at 188px or in the six other languages
