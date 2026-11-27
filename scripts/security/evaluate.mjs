/**
 * Security verdict policy: pure functions over the control manifest, the
 * findings register, exceptions, attestations and check results. The runner
 * (`run.mjs`) gathers evidence; this file decides what it means.
 *
 * A control passes only on positive evidence. Missing evidence, a check that
 * could not run, an expired attestation and a pending runtime check are
 * `blocked`, never a pass.
 */

export const RESULTS = /** @type {const} */ (['pass', 'fail', 'not-applicable', 'blocked']);
export const SEVERITIES = /** @type {const} */ (['critical', 'high', 'medium', 'low']);
export const LEVELS = /** @type {const} */ (['pr', 'release']);
export const CHECK_KINDS = /** @type {const} */ ([
  'test',
  'script',
  'attestation',
  'runtime',
  'not-applicable',
]);

const NON_WAIVABLE = new Set(['critical', 'high']);

function isDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Structural problems in the manifest. Any problem blocks the whole gate: a
 * malformed manifest cannot be trusted to list every control.
 *
 * @param {any} manifest
 * @param {readonly string[]} requiredItems checklist items every manifest must cover
 * @returns {string[]}
 */
export function manifestProblems(manifest, requiredItems) {
  const problems = [];
  if (!manifest || !Array.isArray(manifest.controls)) return ['manifest has no controls array'];
  const ids = new Set();
  const covered = new Set();
  for (const [index, control] of manifest.controls.entries()) {
    const where = `controls[${index}]${control?.id ? ` (${control.id})` : ''}`;
    if (typeof control?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(control.id)) {
      problems.push(`${where}: id must be kebab-case`);
    } else if (ids.has(control.id)) {
      problems.push(`${where}: duplicate id`);
    } else ids.add(control.id);
    if (typeof control?.item !== 'string' || control.item.length === 0) {
      problems.push(`${where}: names no checklist item`);
    } else covered.add(control.item);
    for (const field of ['owner', 'summary']) {
      if (typeof control?.[field] !== 'string' || control[field].length === 0) {
        problems.push(`${where}: missing ${field}`);
      }
    }
    if (!Array.isArray(control?.surfaces) || control.surfaces.length === 0) {
      problems.push(`${where}: lists no affected surfaces`);
    }
    if (!LEVELS.includes(control?.level)) problems.push(`${where}: level must be pr or release`);
    if (!Array.isArray(control?.checks) || control.checks.length === 0) {
      problems.push(`${where}: has no checks`);
      continue;
    }
    for (const [checkIndex, check] of control.checks.entries()) {
      const at = `${where}.checks[${checkIndex}]`;
      if (!CHECK_KINDS.includes(check?.kind)) {
        problems.push(`${at}: unknown kind ${JSON.stringify(check?.kind)}`);
        continue;
      }
      if (
        check.kind === 'test' &&
        (typeof check.file !== 'string' || typeof check.name !== 'string')
      ) {
        problems.push(`${at}: a test check names a file and a test`);
      }
      if (check.kind === 'script' && !Array.isArray(check.command)) {
        problems.push(`${at}: a script check has a command array`);
      }
      if (
        (check.kind === 'attestation' || check.kind === 'runtime') &&
        typeof check.id !== 'string'
      ) {
        problems.push(`${at}: ${check.kind} check has an id`);
      }
      if (check.kind === 'not-applicable') {
        for (const field of ['reason', 'inspected', 'reviewer']) {
          if (typeof check[field] !== 'string' || check[field].length === 0) {
            problems.push(`${at}: not-applicable needs ${field}`);
          }
        }
        if (!Array.isArray(check.guard)) {
          problems.push(
            `${at}: not-applicable needs a guard command that fails when the surface appears`,
          );
        }
      }
    }
  }
  for (const item of requiredItems) {
    if (!covered.has(item)) problems.push(`checklist item "${item}" has no control`);
  }
  return problems;
}

/**
 * Outcome of one check, given gathered evidence.
 *
 * @param {any} check
 * @param {{ mode: 'static' | 'release', testIndex: Map<string, string>, scripts: Map<string, {code: number | null, output: string}>, attestations: Map<string, any>, runtime: Map<string, any>, today: string }} evidence
 * @returns {{ result: typeof RESULTS[number], detail: string }}
 */
export function evaluateCheck(check, evidence) {
  switch (check.kind) {
    case 'test': {
      const source = evidence.testIndex.get(check.file);
      if (source === undefined) return { result: 'fail', detail: `${check.file} is missing` };
      if (!source.includes(check.name)) {
        return { result: 'fail', detail: `${check.file} no longer contains "${check.name}"` };
      }
      return { result: 'pass', detail: `${check.file}: "${check.name}"` };
    }
    case 'script':
    case 'not-applicable': {
      const key = scriptKey(check.kind === 'script' ? check.command : check.guard);
      const run = evidence.scripts.get(key);
      if (!run) return { result: 'blocked', detail: `${key} did not run` };
      if (run.code === null)
        return { result: 'blocked', detail: `${key} could not run or timed out` };
      if (run.code !== 0) {
        return check.kind === 'script'
          ? { result: 'fail', detail: `${key} exited ${run.code}` }
          : {
              result: 'fail',
              detail: `${key}: the surface this control was inapplicable to now exists`,
            };
      }
      return check.kind === 'script'
        ? { result: 'pass', detail: key }
        : {
            result: 'not-applicable',
            detail: `${check.reason} (inspected ${check.inspected}; ${check.reviewer})`,
          };
    }
    case 'attestation': {
      const record = evidence.attestations.get(check.id);
      if (!record) return { result: 'blocked', detail: `attestation ${check.id} is missing` };
      if (!isDate(record.expires) || record.expires < evidence.today) {
        return {
          result: 'blocked',
          detail: `attestation ${check.id} expired or has no valid expiry`,
        };
      }
      for (const field of ['owner', 'recordedAt', 'evidence']) {
        if (typeof record[field] !== 'string' || record[field].length === 0) {
          return { result: 'blocked', detail: `attestation ${check.id} has no ${field}` };
        }
      }
      return record.outcome === 'pass'
        ? { result: 'pass', detail: `attested by ${record.owner} on ${record.recordedAt}` }
        : { result: 'fail', detail: `attestation ${check.id} records ${record.outcome}` };
    }
    case 'runtime': {
      if (evidence.mode === 'static')
        return { result: 'pass', detail: 'runtime check: release only' };
      const record = evidence.runtime.get(check.id);
      if (!record) {
        return {
          result: 'blocked',
          detail: `runtime evidence ${check.id} missing${check.blocker ? `: ${check.blocker}` : ''}`,
        };
      }
      return record.outcome === 'pass'
        ? { result: 'pass', detail: `runtime ${check.id} passed` }
        : { result: 'fail', detail: `runtime ${check.id}: ${record.outcome}` };
    }
    default:
      return { result: 'blocked', detail: `unknown check kind ${check.kind}` };
  }
}

/** Most severe result wins: fail > blocked > pass > not-applicable. */
export function combineResults(results) {
  if (results.length === 0) return 'blocked';
  if (results.includes('fail')) return 'fail';
  if (results.includes('blocked')) return 'blocked';
  if (results.every((result) => result === 'not-applicable')) return 'not-applicable';
  return 'pass';
}

export function scriptKey(command) {
  return command.join(' ');
}

/**
 * Findings and exceptions. A fixed finding whose regression test is gone
 * reopens. An open finding fails unless a valid exception accepts it; an
 * exception never covers critical or high severity, or an active credential.
 *
 * @returns {{ findings: any[], problems: string[] }}
 */
export function evaluateFindings(register, exceptions, testIndex, today) {
  const problems = [];
  const byFinding = new Map();
  for (const exception of exceptions ?? []) byFinding.set(exception.finding, exception);
  const findings = [];
  for (const finding of register ?? []) {
    let status = finding.status;
    let note = '';
    if (!SEVERITIES.includes(finding.severity)) {
      problems.push(`${finding.id}: unknown severity ${finding.severity}`);
    }
    if (status === 'fixed') {
      const tests = Array.isArray(finding.regression) ? finding.regression : [];
      const missing = tests.filter((test) => !(testIndex.get(test.file) ?? '').includes(test.name));
      if (tests.length === 0 || missing.length > 0) {
        status = 'reopened';
        note = tests.length === 0 ? 'no regression test recorded' : 'its regression test is gone';
      }
    }
    if (status === 'open' || status === 'reopened') {
      const exception = byFinding.get(finding.id);
      const waivable = !NON_WAIVABLE.has(finding.severity) && finding.kind !== 'credential';
      const valid =
        exception &&
        waivable &&
        isDate(exception.expires) &&
        exception.expires >= today &&
        typeof exception.owner === 'string' &&
        typeof exception.rationale === 'string' &&
        typeof exception.mitigation === 'string' &&
        exception.fingerprint === finding.fingerprint;
      if (valid) {
        status = 'accepted';
        note = `accepted by ${exception.owner} until ${exception.expires}`;
      } else {
        problems.push(
          `${finding.id} (${finding.severity}) is ${status}${exception && !waivable ? '; its severity cannot be waived' : ''}${exception && waivable ? '; its exception is expired, incomplete or for another fingerprint' : ''}`,
        );
      }
    }
    findings.push({ ...finding, status, ...(note ? { note } : {}) });
  }
  return { findings, problems };
}

/**
 * The verdict: every control in scope passes or is not applicable, and no
 * finding blocks. Static mode scopes to `pr` controls; release takes all.
 */
export function verdict(controlResults, findingProblems, manifestIssues, mode) {
  const scoped = controlResults.filter((control) => mode === 'release' || control.level === 'pr');
  const failing = scoped.filter(
    (control) => control.result !== 'pass' && control.result !== 'not-applicable',
  );
  const approved =
    manifestIssues.length === 0 && failing.length === 0 && findingProblems.length === 0;
  return {
    approved,
    mode,
    controlsInScope: scoped.length,
    failing: failing.map((control) => ({ id: control.id, result: control.result })),
  };
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bclpat_[A-Za-z0-9_-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  // `KEY=value`, or a quoted value after `:` or `=`; prose such as "token: none" is left alone.
  /((?:password|secret|token|api[_-]?key)["']?(?:=|\s*:\s*["']|\s*=\s*["']))[^\s"',;]{6,}/gi,
];

/** Credential-shaped matches in a text, each reduced to its pattern index and offset. */
export function findSecrets(text) {
  const found = [];
  // The last pattern (`key=value`) is for redaction only: in minified code it
  // matches ordinary property names.
  for (const [index, pattern] of SECRET_PATTERNS.slice(0, -1).entries()) {
    for (const match of String(text).matchAll(new RegExp(pattern.source, pattern.flags))) {
      found.push({ pattern: index, offset: match.index ?? 0 });
    }
  }
  return found;
}

/** Replaces anything shaped like a credential before it reaches a report. */
export function redact(text) {
  let out = String(text);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix) =>
      typeof prefix === 'string' && match.startsWith(prefix) ? `${prefix}[redacted]` : '[redacted]',
    );
  }
  return out;
}
