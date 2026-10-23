import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'zh'];

export const ACRONYM_ALLOWLIST = new Set([
  'LIVE',
  'FINAL',
  'PAT',
  'CSV',
  'JSON',
  'API',
  'TV',
  'ID',
  'URL',
  'PIN',
  'QR',
  'SSE',
  'MCP',
  'AGPL',
]);

export const BANNED_WORDS = {
  en: ['sorry', 'oops', 'unfortunately', 'please try again later'],
  es: ['lo sentimos', 'perdón', 'ups', 'lamentablemente'],
  pt: ['desculpe', 'lamentamos', 'ops', 'infelizmente'],
  fr: ['désolé', 'oups', 'malheureusement'],
  it: ['spiacenti', 'ci dispiace', 'ops', 'purtroppo'],
  de: ['leider', 'entschuldigung', 'hoppla'],
  ru: ['извините', 'к сожалению', 'упс'],
  zh: ['抱歉', '对不起', '很遗憾'],
};

export const BARE_BUTTON_LABELS = {
  en: new Set(['submit', 'ok', 'confirm', 'open', 'publish', 'save', 'edit', 'continue', 'rename']),
  es: new Set([
    'enviar',
    'ok',
    'confirmar',
    'abrir',
    'publicar',
    'guardar',
    'editar',
    'continuar',
    'renombrar',
  ]),
  pt: new Set([
    'enviar',
    'ok',
    'confirmar',
    'abrir',
    'publicar',
    'salvar',
    'editar',
    'continuar',
    'renomear',
  ]),
  fr: new Set([
    'soumettre',
    'ok',
    'confirmer',
    'ouvrir',
    'publier',
    'enregistrer',
    'modifier',
    'continuer',
    'renommer',
  ]),
  it: new Set([
    'invia',
    'ok',
    'conferma',
    'apri',
    'pubblica',
    'salva',
    'modifica',
    'continua',
    'rinomina',
  ]),
  de: new Set([
    'absenden',
    'ok',
    'bestätigen',
    'öffnen',
    'veröffentlichen',
    'speichern',
    'bearbeiten',
    'weiter',
    'umbenennen',
  ]),
  ru: new Set([
    'отправить',
    'ок',
    'подтвердить',
    'открыть',
    'опубликовать',
    'сохранить',
    'изменить',
    'продолжить',
    'переименовать',
    'далее',
  ]),
  zh: new Set(['提交', '确定', '确认', '打开', '发布', '保存', '编辑', '继续', '重命名']),
};

const ACTION_KEY_VERBS = ['continue', 'edit', 'open', 'publish', 'rename', 'save'];

export const ACTION_TOAST_PAIRS = [
  {
    action: 'control.scheduleBuilder.publish',
    toast: 'control.scheduleBuilder.published',
  },
];

const ACTION_VERB_ECHOES = {
  en: { publish: 'published' },
  es: { publicar: 'publicado' },
  pt: { publicar: 'publicado' },
  fr: { publier: 'publié' },
  it: { pubblica: 'pubblicato' },
  de: { veröffentlichen: 'veröffentlicht' },
  ru: { опубликовать: 'опубликовано' },
  zh: { 发布: '发布' },
};

const CONTROL_CATALOGUE = 'apps/web/src/control/i18n/messages';
const PUBLIC_CATALOGUE = 'apps/web/src/lib/i18n/public-messages';
const EMAIL_COPY = 'apps/worker/src/notifications/email-copy.ts';

/**
 * Pre-existing copy violations, keyed by repository-relative source path.
 * A recorded count may only go down; remove each entry when its count reaches zero.
 */
export const KNOWN_COPY_DEBT = new Map([]);

function propertyName(name, sourceFile) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return name.getText(sourceFile);
}

function propertyValue(object, name, sourceFile) {
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  const property = object.properties.find(
    (item) => ts.isPropertyAssignment(item) && propertyName(item.name, sourceFile) === name,
  );
  return property?.initializer;
}

function templateText(node) {
  return [
    node.head.text,
    ...node.templateSpans.flatMap((span) => ['{value}', span.literal.text]),
  ].join('');
}

function staticText(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return templateText(node);
  return undefined;
}

function sourceLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function variableInitializers(sourceFile) {
  const initializers = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        initializers.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return initializers;
}

function findMessagesObject(sourceFile) {
  const initializers = variableInitializers(sourceFile);
  const initializer = initializers.get('messages');
  if (initializer && ts.isCallExpression(initializer)) {
    return initializer.arguments.find(ts.isObjectLiteralExpression);
  }
  return initializer && ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

/** Read English descriptors or a translated ID-to-string map from a catalogue module. */
export function extractCatalogueMessages(content, filename, language) {
  const sourceFile = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const object = findMessagesObject(sourceFile);
  if (!object) return [];

  const messages = [];
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const localKey = propertyName(property.name, sourceFile);
    if (language === 'en') {
      const id = staticText(propertyValue(property.initializer, 'id', sourceFile));
      const valueNode = propertyValue(property.initializer, 'defaultMessage', sourceFile);
      const value = staticText(valueNode);
      if (value !== undefined) {
        messages.push({
          key: id ?? localKey,
          localKey,
          value,
          line: sourceLine(sourceFile, valueNode),
        });
      }
      continue;
    }

    const value = staticText(property.initializer);
    if (value !== undefined) {
      messages.push({
        key: localKey,
        localKey,
        value,
        line: sourceLine(sourceFile, property.initializer),
      });
    }
  }
  return messages;
}

function collectEmailText(node, sourceFile, language, key, output) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    output.push({ language, key, value: node.text, line: sourceLine(sourceFile, node) });
    return;
  }
  if (ts.isTemplateExpression(node)) {
    output.push({
      language,
      key,
      value: templateText(node),
      line: sourceLine(sourceFile, node),
    });
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        collectEmailText(
          property.initializer,
          sourceFile,
          language,
          `${key}.${propertyName(property.name, sourceFile)}`,
          output,
        );
      } else if (ts.isShorthandPropertyAssignment(property)) {
        collectEmailText(
          property.name,
          sourceFile,
          language,
          `${key}.${property.name.text}`,
          output,
        );
      }
    }
    return;
  }
  if (ts.isIdentifier(node)) return;

  ts.forEachChild(node, (child) => collectEmailText(child, sourceFile, language, key, output));
}

/** Read every localized string, including static text inside email template functions. */
export function extractEmailCopy(content, filename = EMAIL_COPY) {
  const sourceFile = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const initializers = variableInitializers(sourceFile);
  const copyObject = initializers.get('COPY');
  if (!copyObject || !ts.isObjectLiteralExpression(copyObject)) return [];

  const values = [];
  for (const property of copyObject.properties) {
    let language;
    let initializer;
    if (ts.isShorthandPropertyAssignment(property)) {
      language = property.name.text;
      initializer = initializers.get(language);
    } else if (ts.isPropertyAssignment(property)) {
      language = propertyName(property.name, sourceFile);
      initializer = property.initializer;
      if (ts.isIdentifier(initializer)) initializer = initializers.get(initializer.text);
    }
    if (!SUPPORTED_LANGUAGES.includes(language) || !initializer) continue;
    collectEmailText(initializer, sourceFile, language, language, values);
  }
  return values;
}

function visibleText(value) {
  return value
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllCaps(value) {
  const visible = visibleText(value);
  const letters = [...visible].filter(
    (character) => character.toLowerCase() !== character.toUpperCase(),
  );
  if (letters.length <= 1 || !letters.every((character) => /\p{Lu}/u.test(character))) return false;
  const casedWords = (visible.match(/\p{L}+/gu) ?? []).filter((word) =>
    [...word].some((character) => character.toLowerCase() !== character.toUpperCase()),
  );
  return !casedWords.every((word) => ACRONYM_ALLOWLIST.has(word));
}

function containsBannedWord(value, language) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase(language);
  return (BANNED_WORDS[language] ?? []).find((term) => {
    if (/\p{L}/u.test(term.at(-1)) && /\p{L}/u.test(term[0])) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(normalized);
    }
    return normalized.includes(term);
  });
}

function isActionKey(key, localKey) {
  if (
    /(?:^|\.)action\./iu.test(key) ||
    /button$/iu.test(key) ||
    /button$/iu.test(localKey) ||
    ACTION_TOAST_PAIRS.some((pair) => pair.action === key)
  ) {
    return true;
  }
  return [key, localKey].some((candidate) => {
    const parts = candidate
      .split('.')
      .map((part) => part.replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase('en'));
    return parts.some((part) =>
      ACTION_KEY_VERBS.some((verb) => part.startsWith(verb) || part.endsWith(verb)),
    );
  });
}

function bareLabel(value, language) {
  return value
    .trim()
    .replace(/[.!?…]+$/u, '')
    .toLocaleLowerCase(language);
}

export function checkToastVerbEcho(actionText, toastText, language = 'en') {
  const actionWords = actionText.toLocaleLowerCase(language).match(/\p{L}+/gu) ?? [];
  const echoes = ACTION_VERB_ECHOES[language] ?? {};
  const expected = Object.entries(echoes).find(([verb]) =>
    language === 'zh' ? actionText.includes(verb) : actionWords.includes(verb),
  )?.[1];
  if (!expected) return { ok: false, expected: undefined };
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ok =
    language === 'zh'
      ? toastText.includes(expected)
      : new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'iu').test(toastText);
  return { ok, expected };
}

export function inspectMessage(message, language, file, includeButtonChecks = false) {
  const findings = [];
  if (isAllCaps(message.value)) {
    findings.push({
      file,
      language,
      key: message.key,
      kind: 'uppercase',
      line: message.line,
      value: message.value,
    });
  }
  const bannedWord = containsBannedWord(message.value, language);
  if (bannedWord) {
    findings.push({
      file,
      language,
      key: message.key,
      kind: 'apology',
      line: message.line,
      value: message.value,
      match: bannedWord,
    });
  }
  if (
    includeButtonChecks &&
    isActionKey(message.key, message.localKey) &&
    BARE_BUTTON_LABELS[language]?.has(bareLabel(message.value, language))
  ) {
    findings.push({
      file,
      language,
      key: message.key,
      kind: 'bare-action',
      line: message.line,
      value: message.value,
    });
  }
  return findings;
}

function inspectToastPairs(messages, file, language) {
  const byKey = new Map(messages.map((message) => [message.key, message]));
  const findings = [];
  for (const pair of ACTION_TOAST_PAIRS) {
    const action = byKey.get(pair.action);
    const toast = byKey.get(pair.toast);
    if (!action || !toast) {
      findings.push({
        file,
        language,
        key: `${pair.action} -> ${pair.toast}`,
        kind: 'missing-action-toast-pair',
        value: !action ? pair.action : pair.toast,
      });
      continue;
    }
    const result = checkToastVerbEcho(action.value, toast.value, language);
    if (!result.ok) {
      findings.push({
        file,
        language,
        key: `${pair.action} -> ${pair.toast}`,
        kind: 'toast-verb-mismatch',
        line: toast.line,
        value: toast.value,
        expectedVerb: result.expected ?? '(add an echo mapping)',
      });
    }
  }
  return findings;
}

function cataloguePath(prefix, language) {
  return `${prefix}.${language}.ts`;
}

/** Scan catalogue values and localized email copy, before applying the debt ratchet. */
export function scanCopyVoice(root) {
  const findings = [];
  for (const [prefix, includeButtonChecks, checkToastPairs] of [
    [CONTROL_CATALOGUE, true, true],
    [PUBLIC_CATALOGUE, true, false],
  ]) {
    const localizedMessages = [];
    for (const language of SUPPORTED_LANGUAGES) {
      const path = cataloguePath(prefix, language);
      const absolutePath = resolve(root, path);
      if (!existsSync(absolutePath)) {
        findings.push({ file: path, language, key: path, kind: 'missing-catalogue', value: '' });
        continue;
      }
      const messages = extractCatalogueMessages(readFileSync(absolutePath, 'utf8'), path, language);
      localizedMessages.push([language, messages]);
      for (const message of messages) {
        findings.push(...inspectMessage(message, language, path, includeButtonChecks));
      }
    }
    if (checkToastPairs) {
      for (const [language, messages] of localizedMessages) {
        findings.push(...inspectToastPairs(messages, cataloguePath(prefix, language), language));
      }
    }
  }

  const emailPath = resolve(root, EMAIL_COPY);
  if (!existsSync(emailPath)) {
    findings.push({
      file: EMAIL_COPY,
      language: 'all',
      key: EMAIL_COPY,
      kind: 'missing-catalogue',
      value: '',
    });
  } else {
    for (const message of extractEmailCopy(readFileSync(emailPath, 'utf8'))) {
      findings.push(...inspectMessage(message, message.language, EMAIL_COPY, false));
    }
  }
  return findings;
}

/** Apply the per-file ratchet. New debt and an unrecorded improvement both fail. */
export function reconcileCopyDebt(findings, debt = KNOWN_COPY_DEBT) {
  const grouped = new Map();
  for (const finding of findings) {
    const entries = grouped.get(finding.file) ?? [];
    entries.push(finding);
    grouped.set(finding.file, entries);
  }

  const effective = [];
  const files = new Set([...grouped.keys(), ...debt.keys()]);
  for (const file of files) {
    const entries = grouped.get(file) ?? [];
    const allowance = debt.get(file) ?? 0;
    if (entries.length > allowance) {
      effective.push(...entries.slice(allowance));
    } else if (entries.length < allowance) {
      effective.push({
        file,
        language: 'all',
        key: file,
        kind: 'debt-register-ratchet',
        value: `${entries.length} current, ${allowance} recorded`,
      });
    }
  }
  return effective;
}

function printReport(findings, rawCount) {
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ rawCount, findings }, null, 2)}\n`);
    return;
  }
  if (findings.length === 0) {
    const debt = [...KNOWN_COPY_DEBT.values()].reduce((sum, count) => sum + count, 0);
    process.stdout.write(
      `\u001b[32m[PASS]\u001b[0m Copy voice is consistent${debt ? ` (${debt} recorded violation(s) remain)` : ''}.\n`,
    );
    return;
  }

  process.stdout.write(`\u001b[31m[FAIL]\u001b[0m ${findings.length} copy-voice violation(s):\n\n`);
  for (const finding of findings) {
    const location = finding.line === undefined ? '' : `:${finding.line}`;
    const detail = finding.match ? ` (${finding.match})` : '';
    const expected = finding.expectedVerb ? `; expected verb: ${finding.expectedVerb}` : '';
    process.stdout.write(
      `  ${finding.file}${location} [${finding.language}] ${finding.key}: ${finding.kind}${detail}${expected}` +
        (finding.value ? ` — ${JSON.stringify(finding.value)}` : '') +
        '\n',
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const findings = scanCopyVoice(root);
  const effective = reconcileCopyDebt(findings);
  printReport(effective, findings.length);
  if (effective.length > 0) process.exitCode = 1;
}
