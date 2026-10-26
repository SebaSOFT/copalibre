import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'zh'];

const CATALOGUE_PATHS = [
  /^apps\/web\/src\/control\/i18n\/messages\.([a-z]{2})\.ts$/,
  /^apps\/web\/src\/lib\/i18n\/public-messages\.([a-z]{2})\.ts$/,
];

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function propertyName(name, sourceFile) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return name.getText(sourceFile);
}

function findProperty(object, name, sourceFile) {
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  const property = object.properties.find(
    (item) => ts.isPropertyAssignment(item) && propertyName(item.name, sourceFile) === name,
  );
  return property?.initializer;
}

function staticString(node, sourceFile, context) {
  if (!node) throw new Error(`Missing ${context}`);
  node = unwrap(node);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return (
      staticString(node.left, sourceFile, context) + staticString(node.right, sourceFile, context)
    );
  }
  throw new Error(
    `Expected a string literal for ${context} at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`,
  );
}

function messagesObject(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'messages') continue;
      if (!declaration.initializer) break;

      let initializer = unwrap(declaration.initializer);
      if (ts.isCallExpression(initializer)) {
        if (initializer.arguments.length !== 1) break;
        initializer = unwrap(initializer.arguments[0]);
      }
      if (ts.isObjectLiteralExpression(initializer)) return initializer;
    }
  }
  throw new Error(`${sourceFile.fileName} does not export a messages object`);
}

/** Read the message id and display text from one English or translated catalogue. */
export function parseCatalogue(source, filename = '<catalogue>') {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    throw new Error(`Could not parse ${filename}: ${message}`);
  }

  const object = messagesObject(sourceFile);
  const messages = new Map();

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const initializer = unwrap(property.initializer);

    if (ts.isObjectLiteralExpression(initializer)) {
      const idNode = findProperty(initializer, 'id', sourceFile);
      const messageNode = findProperty(initializer, 'defaultMessage', sourceFile);
      const key = staticString(idNode, sourceFile, 'message id');
      const value = staticString(messageNode, sourceFile, `default message for ${key}`);
      messages.set(key, value);
      continue;
    }

    const key = propertyName(property.name, sourceFile);
    const value = staticString(initializer, sourceFile, `translation for ${key}`);
    messages.set(key, value);
  }

  return messages;
}

function catalogueLanguage(path) {
  const match = CATALOGUE_PATHS.map((pattern) => path.match(pattern)).find(Boolean);
  if (!match || !SUPPORTED_LANGUAGES.includes(match[1])) return undefined;
  return match[1];
}

function runGit(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return undefined;
    const detail = error.stderr?.toString().trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`, {
      cause: error,
    });
  }
}

function readFileAtRef(cwd, ref, path) {
  const object = `${ref}:${path}`;
  if (runGit(cwd, ['cat-file', '-e', object], { allowFailure: true }) === undefined)
    return undefined;
  return runGit(cwd, ['show', object]);
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes)) throw new Error('The changed-string list must be a JSON array');
  return changes
    .map((change) => {
      if (
        typeof change?.key !== 'string' ||
        typeof change?.language !== 'string' ||
        !(change.old === null || typeof change.old === 'string') ||
        !(change.new === null || typeof change.new === 'string')
      ) {
        throw new Error('Each changed string must have key, language, old and new fields');
      }
      return { key: change.key, language: change.language, old: change.old, new: change.new };
    })
    .sort(
      (left, right) =>
        compareText(left.key, right.key) || compareText(left.language, right.language),
    );
}

export function diffCatalogue(oldMessages, newMessages, language) {
  const changes = [];
  const keys = new Set([...oldMessages.keys(), ...newMessages.keys()]);

  for (const key of keys) {
    const oldValue = oldMessages.has(key) ? oldMessages.get(key) : null;
    const newValue = newMessages.has(key) ? newMessages.get(key) : null;
    if (oldValue === newValue) continue;
    changes.push({ key, language, old: oldValue, new: newValue });
  }

  return changes;
}

/** Compare the supported message catalogue families between two Git revisions. */
export function collectChangedStrings({ cwd = REPOSITORY_ROOT, baseRef, headRef }) {
  if (!baseRef || !headRef) throw new Error('Both baseRef and headRef are required');

  const changedPaths = runGit(cwd, [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    baseRef,
    headRef,
    '--',
    'apps/web/src/control/i18n/messages.*.ts',
    'apps/web/src/lib/i18n/public-messages.*.ts',
  ])
    .split('\0')
    .filter(Boolean);

  const changes = [];
  for (const path of changedPaths) {
    const language = catalogueLanguage(path);
    if (!language) continue;

    const oldSource = readFileAtRef(cwd, baseRef, path);
    const newSource = readFileAtRef(cwd, headRef, path);
    const oldMessages = oldSource === undefined ? new Map() : parseCatalogue(oldSource, path);
    const newMessages = newSource === undefined ? new Map() : parseCatalogue(newSource, path);
    changes.push(...diffCatalogue(oldMessages, newMessages, language));
  }

  return normalizeChanges(changes);
}

export function formatChanges(changes) {
  return JSON.stringify(normalizeChanges(changes), null, 2);
}

export function changedStringsFromBody(body) {
  const lines = body.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Changed interface strings\s*$/i.test(line));
  if (heading < 0) throw new Error('PR body is missing the "Changed interface strings" section');

  const end = lines.findIndex((line, index) => index > heading && /^#{1,6}\s/.test(line));
  const section = lines.slice(heading + 1, end < 0 ? undefined : end).join('\n');
  const block = section.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (!block)
    throw new Error('Add the script output as a fenced JSON block in "Changed interface strings"');

  try {
    return normalizeChanges(JSON.parse(block[1]));
  } catch (error) {
    throw new Error(`Could not read the changed-string JSON block: ${error.message}`, {
      cause: error,
    });
  }
}

function eventPullRequest(eventPath) {
  if (!eventPath) return undefined;
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  return event.pull_request;
}

function diffRefs({ baseRef, headRef, cwd, env, pullRequest }) {
  if (pullRequest?.base?.sha && pullRequest?.head?.sha) {
    return { baseRef: pullRequest.base.sha, headRef: pullRequest.head.sha };
  }
  if (baseRef && headRef) return { baseRef, headRef };

  const base =
    baseRef ?? (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : 'origin/develop');
  const head = headRef ?? env.GITHUB_SHA ?? 'HEAD';
  const mergeBase = runGit(cwd, ['merge-base', base, head]);
  return { baseRef: mergeBase, headRef: head };
}

function parseArguments(args) {
  const options = { checkBody: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check-body') options.checkBody = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--base' || argument === '--head') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a Git ref`);
      options[argument.slice(2) === 'base' ? 'baseRef' : 'headRef'] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/list-changed-strings.mjs [--base <ref>] [--head <ref>] [--check-body]',
    'Prints a JSON list of changed catalogue keys (key, language, old and new).',
    'With --check-body, compares that list with the pull request event body.',
  ].join('\n');
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    const cwd = REPOSITORY_ROOT;
    const env = process.env;
    const pullRequest = eventPullRequest(env.GITHUB_EVENT_PATH);
    if (options.checkBody && !pullRequest) {
      throw new Error('--check-body requires a pull_request GitHub event');
    }
    const refs = diffRefs({ ...options, cwd, env, pullRequest });
    const changes = collectChangedStrings({ cwd, ...refs });
    process.stdout.write(`${formatChanges(changes)}\n`);

    if (!options.checkBody || changes.length === 0) return;

    const actual = changedStringsFromBody(pullRequest.body ?? '');
    if (JSON.stringify(actual) !== JSON.stringify(changes)) {
      process.stderr.write(
        'The PR body changed-string list does not match the catalogue diff. Paste this JSON under "Changed interface strings":\n',
      );
      process.stderr.write(`${formatChanges(changes)}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write('Changed interface strings match the pull request body.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
