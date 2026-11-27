# Security gate

The security gate decides whether a revision may be released. It reads the records in this
directory, gathers evidence, and writes a report. It does not certify that CopaLibre has no
vulnerabilities; it checks that every control the owner asked for has current evidence.

```bash
yarn security:check     # static controls; runs on every pull request
yarn security:release   # every control; runs for release candidates
```

Both write `security-report/security-report.json` and `security-report/security-report.md` (in
Spanish) and exit 1 unless the verdict is approved. `--out <dir>` changes the directory.
`security:release` also takes `--runtime-evidence <dir>`, a directory holding
`runtime-evidence.json` from the production-profile deployment, and `--artifact-manifest <file>`,
the digests of the candidate artifacts the report describes.

## Records

| File                       | Holds                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| `controls.json`            | The checklist and one or more controls per item, each with its checks     |
| `findings.json`            | Every reproduced finding, its severity, status and regression tests       |
| `exceptions.json`          | Owner-approved acceptance of an open medium or low finding                |
| `attestations.json`        | Manual evidence: reviews, credential incidents, operator actions          |
| `attack-surface.md`        | Entry points, uploads, outbound connections and the trust-boundary review |
| `reviews.md`               | Evidence behind the manual attestations                                   |
| `incident-response.md`     | What raises a security alert, who responds and how                        |
| `assessment-2026-11.es.md` | The November 2026 assessment, in Spanish                                  |

### Controls

Each control has a kebab-case `id`, the checklist `item` it covers, an `owner`, a `summary`, the
affected `surfaces`, a `level` (`pr` or `release`) and its `checks`:

| Kind             | Passes when                                                                    |
| ---------------- | ------------------------------------------------------------------------------ |
| `test`           | `file` still contains the test `name`; CI runs the test itself                 |
| `script`         | `command` exits 0 within ten minutes                                           |
| `not-applicable` | its `guard` command exits 0; it also records `reason`, `inspected`, `reviewer` |
| `attestation`    | `attestations.json` has a complete, unexpired record with outcome `pass`       |
| `runtime`        | release mode only: the runtime evidence records `pass` for its `id`            |

A control's result is the most severe of its checks: `fail`, then `blocked`, then `pass`, and
`not-applicable` only when every check is. Missing evidence, a check that could not run and an
expired attestation are `blocked`, never a pass. Every checklist item must have a control, or the
manifest itself fails.

### Findings and exceptions

A finding records `id`, `severity` (`critical`, `high`, `medium`, `low`), the `control` it belongs
to, `status` (`open` or `fixed`), a `summary` with no secret value, a `fingerprint` naming where it
is, and for a fixed finding its `regression` tests. A fixed finding whose regression test is gone
reopens.

An open finding fails the gate unless an exception accepts it. An exception names the `finding`,
its `fingerprint`, the `owner` who approved it, a `rationale`, a `mitigation` and an `expires`
date. Exceptions never cover critical or high findings, or a credential finding (`kind:
"credential"`); those block until fixed, or until the credential is revoked and replaced.

### Attestations

An attestation records `id`, `owner`, `recordedAt`, `expires`, `outcome` (`pass` or `fail`) and
`evidence`, a description or link that holds no secret value. A compromised credential stays
blocking until its attestation records revocation, replacement and a check that the old value is
refused.

## Redaction

The runner removes anything shaped like a credential from script output before it reaches a
report: private key blocks, personal access tokens, JWTs, GitHub tokens, AWS keys and quoted or
`KEY=value` secrets. A scanner's own output is redacted the same way.

## Secret history

`git-history-secrets` runs [gitleaks](https://github.com/gitleaks/gitleaks) over every ref and its
whole history with `--redact`, so no matched value reaches a log or report. Release jobs install the
pinned version with `scripts/security/install-gitleaks.sh`, which checks the archive's SHA-256 first;
locally, put the same version on `PATH`. The scan covers only the refs this checkout has: run it from
a full clone (`fetch-depth: 0` in CI). History that was deleted from the remote cannot be scanned.

A match that review shows is not a credential, such as a synthetic test value, goes into
`.gitleaksignore` by its fingerprint (commit, file, rule and line), under a comment saying why. Every
other match fails the control. A real credential is never ignored: it becomes a finding with
`kind: "credential"`, which no exception can accept, and stays blocking until an attestation records
that it was revoked, replaced and that the old value is refused. Deleting it from the tree or from
history does not close it.
