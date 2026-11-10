import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  combineResults,
  evaluateCheck,
  evaluateFindings,
  manifestProblems,
  redact,
  scriptKey,
  verdict,
} from './evaluate.mjs';

/**
 * Security gate entry point.
 *
 *   node scripts/security/run.mjs --mode static            (every pull request)
 *   node scripts/security/run.mjs --mode release \
 *     --runtime-evidence <dir> --artifact-manifest <file>  (release candidates)
 *
 * Reads the control manifest and registers under docs/security/, runs the
 * script checks with a time bound, confirms every referenced test still
 * exists, and writes security-report.json and security-report.md to --out
 * (default `security-report/`). Exits 1 unless the verdict is approved.
 */

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const SECURITY = join(ROOT, 'docs', 'security');
const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000;

function parseArgs(argv) {
  const args = { mode: 'static', out: 'security-report' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--mode') args.mode = value;
    else if (flag === '--out') args.out = value;
    else if (flag === '--runtime-evidence') args.runtimeEvidence = value;
    else if (flag === '--artifact-manifest') args.artifactManifest = value;
    else throw new Error(`unknown argument ${flag}`);
    index += 1;
  }
  if (args.mode !== 'static' && args.mode !== 'release') {
    throw new Error('--mode must be static or release');
  }
  return args;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function runScript(command) {
  const [program, ...rest] = command;
  const result = spawnSync(program, rest, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { code: result.error ? null : result.status, output: redact(output).slice(-4000) };
}

function runtimeEvidence(dir) {
  const records = new Map();
  if (!dir) return records;
  const file = join(dir, 'runtime-evidence.json');
  for (const record of readJson(file, [])) records.set(record.id, record);
  return records;
}

const ESTADO = {
  pass: 'aprobado',
  fail: 'falla',
  'not-applicable': 'no aplica',
  blocked: 'bloqueado',
};

function markdown(report) {
  const lines = [
    '# Reporte de seguridad',
    '',
    `- Revisión: \`${report.revision}\``,
    `- Modo: ${report.mode}`,
    `- Fecha: ${report.generatedAt}`,
    `- Node: ${report.tools.node}`,
    `- Veredicto: **${report.verdict.approved ? 'aprobado' : 'rechazado'}** (${report.verdict.controlsInScope} controles en alcance)`,
    '',
  ];
  if (report.artifacts) {
    lines.push('## Artefactos', '', '| Artefacto | SHA-256 |', '|---|---|');
    for (const artifact of report.artifacts)
      lines.push(`| ${artifact.name} | \`${artifact.sha256}\` |`);
    lines.push('');
  }
  if (report.manifestProblems.length > 0) {
    lines.push('## Problemas del manifiesto', '');
    for (const problem of report.manifestProblems) lines.push(`- ${problem}`);
    lines.push('');
  }
  lines.push(
    '## Controles',
    '',
    '| Control | Ítem | Nivel | Resultado | Evidencia |',
    '|---|---|---|---|---|',
  );
  for (const control of report.controls) {
    const evidence = control.checks.map((check) => check.detail.replaceAll('|', '\\|')).join('; ');
    lines.push(
      `| \`${control.id}\` | ${control.item} | ${control.level} | ${ESTADO[control.result]} | ${evidence} |`,
    );
  }
  lines.push(
    '',
    '## Hallazgos',
    '',
    '| Hallazgo | Severidad | Estado | Resumen |',
    '|---|---|---|---|',
  );
  for (const finding of report.findings) {
    lines.push(
      `| \`${finding.id}\` | ${finding.severity} | ${finding.status}${finding.note ? ` (${finding.note})` : ''} | ${finding.summary} |`,
    );
  }
  if (report.findingProblems.length > 0) {
    lines.push('', '### Hallazgos que bloquean', '');
    for (const problem of report.findingProblems) lines.push(`- ${problem}`);
  }
  lines.push(
    '',
    '## Límites',
    '',
    'Este reporte cubre los controles del manifiesto para esta revisión. No certifica la ausencia de vulnerabilidades ni cubre instalaciones de terceros.',
    '',
  );
  return lines.join('\n');
}

export function runGate(args) {
  const manifest = readJson(join(SECURITY, 'controls.json'), undefined);
  const register = readJson(join(SECURITY, 'findings.json'), []);
  const exceptions = readJson(join(SECURITY, 'exceptions.json'), []);
  const attestations = new Map(
    readJson(join(SECURITY, 'attestations.json'), []).map((record) => [record.id, record]),
  );
  const issues = manifestProblems(manifest, manifest?.checklist ?? []);
  const controls = Array.isArray(manifest?.controls) ? manifest.controls : [];

  const referenced = new Set();
  for (const control of controls) {
    for (const check of control.checks ?? []) if (check.kind === 'test') referenced.add(check.file);
  }
  for (const finding of register) {
    for (const test of finding.regression ?? []) referenced.add(test.file);
  }
  const testIndex = new Map();
  for (const file of referenced) {
    const path = join(ROOT, file);
    if (existsSync(path)) testIndex.set(file, readFileSync(path, 'utf8'));
  }

  const scripts = new Map();
  for (const control of controls) {
    if (args.mode === 'static' && control.level !== 'pr') continue;
    for (const check of control.checks ?? []) {
      const command =
        check.kind === 'script'
          ? check.command
          : check.kind === 'not-applicable'
            ? check.guard
            : undefined;
      if (!Array.isArray(command)) continue;
      const key = scriptKey(command);
      if (!scripts.has(key)) scripts.set(key, runScript(command));
    }
  }

  const evidence = {
    mode: args.mode,
    testIndex,
    scripts,
    attestations,
    runtime: runtimeEvidence(args.runtimeEvidence),
    today: new Date().toISOString().slice(0, 10),
  };
  const controlResults = controls.map((control) => {
    const inScope = args.mode === 'release' || control.level === 'pr';
    const checks = inScope
      ? (control.checks ?? []).map((check) => ({
          kind: check.kind,
          ...evaluateCheck(check, evidence),
        }))
      : [
          {
            kind: 'scope',
            result: 'blocked',
            detail: 'release-level control; not run in static mode',
          },
        ];
    return {
      id: control.id,
      item: control.item,
      level: control.level,
      owner: control.owner,
      summary: control.summary,
      result: inScope ? combineResults(checks.map((check) => check.result)) : 'blocked',
      checks,
    };
  });

  const { findings, problems: findingProblems } = evaluateFindings(
    register,
    exceptions,
    testIndex,
    evidence.today,
  );
  const artifacts = args.artifactManifest
    ? readJson(args.artifactManifest, undefined)?.artifacts
    : undefined;
  if (args.mode === 'release' && args.artifactManifest && !Array.isArray(artifacts)) {
    issues.push(`artifact manifest ${args.artifactManifest} is missing or malformed`);
  }

  const report = {
    revision: git(['rev-parse', 'HEAD']) ?? 'unknown',
    mode: args.mode,
    generatedAt: new Date().toISOString(),
    tools: { node: process.version },
    ...(artifacts ? { artifacts } : {}),
    manifestProblems: issues,
    verdict: verdict(controlResults, findingProblems, issues, args.mode),
    controls: controlResults,
    findings,
    findingProblems,
    scripts: Object.fromEntries([...scripts].map(([key, run]) => [key, run])),
  };
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = runGate(args);
  const out = resolve(ROOT, args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'security-report.json'), redact(`${JSON.stringify(report, null, 2)}\n`));
  writeFileSync(join(out, 'security-report.md'), redact(markdown(report)));
  const summary = `Security ${args.mode} verdict: ${report.verdict.approved ? 'approved' : 'rejected'} (${report.verdict.controlsInScope} controls in scope)`;
  process.stdout.write(`${summary}\n`);
  for (const failing of report.verdict.failing)
    process.stdout.write(`  ${failing.result}: ${failing.id}\n`);
  for (const problem of [...report.manifestProblems, ...report.findingProblems]) {
    process.stdout.write(`  ${problem}\n`);
  }
  process.exit(report.verdict.approved ? 0 : 1);
}
