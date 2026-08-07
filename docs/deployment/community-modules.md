# Community modules

Disciplines and tournament profiles are data, never code: a module is a JSON document referencing
a fixed, core-owned vocabulary of rule actions/conditions/parameters, never arbitrary logic. That
is what makes installing a community-authored module safe.

## Installing from the curated repository

```
copalibre module add <alias>[@range]
```

Resolves `<alias>` (with an optional semver range, e.g. `orbital-frisbee@^1.0.0`) against
[github.com/SebaSOFT/copalibre-modules](https://github.com/SebaSOFT/copalibre-modules), the
project's one curated module repository, fetches the highest published version satisfying the
range, validates it (identical to what the repository's own pull-request check runs), and imports
it. No location is ever required — a module name means the same thing on every installation.

A profile whose required capabilities no installed discipline satisfies is reported, not
installed, unless `--allow-unsatisfied-capabilities` is passed explicitly — matching the
capability model's soft dependency (a profile authored ahead of the discipline it targets is a
legitimate ordering, not an error).

## Managing installed modules

- `copalibre module list` — every installed module's kind, version, attribution, and source.
- `copalibre module list --outdated` — the same, filtered to modules with a newer version
  published at their own recorded source, classified major/minor/patch.
- `copalibre module remove <alias>` — refuses when any installed version is referenced by a
  started or finished tournament, naming the tournaments.
- `copalibre module verify` — re-runs registry-reference, core-version, and asset validation
  against every installed module. This is what catches drift a core upgrade introduces (a module
  referencing a since-retired rule identifier) or a tightened asset limit an already-installed
  module no longer satisfies — neither is checked again automatically after install, only on
  `verify`.
- `copalibre doctor` includes a `retirable-modules` check: installed discipline versions no
  started or finished tournament references, safe to `module remove`.

## Installing from a private or alternate source

An internal discipline a federation will never publish, or a module for an air-gapped
installation, does not belong in the public curated repository. Configure an allow-list of
additional Git repository URLs this installation trusts:

```
COPALIBRE_MODULE_SOURCE_ALLOWLIST=https://git.example.org/our-federation/copalibre-modules.git
```

(Comma-separated for more than one.) Then install with the source named explicitly:

```
copalibre module add our-discipline --source https://git.example.org/our-federation/copalibre-modules.git
```

A `--source` naming a URL that is **not** in the allow-list is refused — the flag alone is never
enough, matching the rule that an alternate source is opt-in and explicit, never a default or an
implicit fallback. The allow-listed repository must use the identical layout and tag convention as
the curated repository (`disciplines/<alias>/` or `profiles/<alias>/`, tagged `<alias>@<version>`)
and passes exactly the validation a curated module passes — there is no reduced check for a
private source.

`copalibre module list` states each installed module's source (`curated` or `alternate`) so "where
did this come from" is answerable without archaeology. Installing from an alternate source over an
alias already held by a module of different attribution is refused, naming the alias and the
existing holder — an allow-listed source can never shadow an installed module it does not actually
own.

## Contributing to the curated repository

See [copalibre-modules' own README](https://github.com/SebaSOFT/copalibre-modules) for the
contribution flow (fork, add a module directory, open a pull request) and the module package
format with worked examples of both kinds.
