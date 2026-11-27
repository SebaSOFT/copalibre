import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkToastVerbEcho,
  extractCatalogueMessages,
  extractEmailCopy,
  inspectMessage,
  reconcileCopyDebt,
} from './check-copy-voice.mjs';

test('all-caps detection respects the acronym allowlist and flags catalogue copy', () => {
  const message = (value) => ({ key: 'test.label', localKey: 'label', value, line: 1 });
  assert.equal(inspectMessage(message('LIVE'), 'en', 'messages.en.ts').length, 0);
  assert.equal(inspectMessage(message('AGPL-3.0'), 'en', 'messages.en.ts').length, 0);
  assert.equal(
    inspectMessage(message('OBS Studio 浏览器源链接'), 'zh', 'messages.zh.ts').length,
    0,
  );
  assert.equal(inspectMessage(message('0 兆字节 / 0 个文件'), 'zh', 'messages.zh.ts').length, 0);
  assert.equal(inspectMessage(message('PNG, JPG, SVG or WebP.'), 'en', 'messages.en.ts').length, 0);
  assert.equal(inspectMessage(message('ТВ'), 'ru', 'messages.ru.ts')[0].kind, 'uppercase');
  assert.equal(inspectMessage(message('DNF'), 'en', 'messages.en.ts')[0].kind, 'uppercase');
  assert.equal(inspectMessage(message('导出配置 JSON'), 'zh', 'messages.zh.ts').length, 0);
  assert.equal(inspectMessage(message('EN VIVO'), 'es', 'messages.es.ts')[0].kind, 'uppercase');
});

test('banned apology words are checked with each language catalogue', () => {
  const cases = [
    ['en', 'Sorry, the schedule could not be published.', 'sorry'],
    ['es', 'Perdón, no se pudo publicar el calendario.', 'perdón'],
    ['pt', 'Desculpe, não foi possível publicar o calendário.', 'desculpe'],
    ['fr', 'Désolé, le calendrier ne peut pas être publié.', 'désolé'],
    ['it', 'Ci dispiace, non è stato possibile pubblicare il calendario.', 'ci dispiace'],
    ['de', 'Leider konnte der Spielplan nicht veröffentlicht werden.', 'leider'],
    ['ru', 'Извините, расписание не удалось опубликовать.', 'извините'],
    ['zh', '抱歉，无法发布赛程。', '抱歉'],
  ];

  for (const [language, value, banned] of cases) {
    const findings = inspectMessage(
      { key: 'test.error', localKey: 'error', value },
      language,
      'catalogue.ts',
    );
    assert.equal(findings.find((finding) => finding.kind === 'apology')?.match, banned);
  }
  assert.equal(
    inspectMessage(
      {
        key: 'test.message',
        localKey: 'message',
        value: 'Pass the current schedule to a referee.',
      },
      'en',
      'messages.en.ts',
    ).length,
    0,
  );
});

test('bare verbs fail only for action keys', () => {
  const bare = inspectMessage(
    {
      key: 'control.schedule.action.save',
      localKey: 'saveButton',
      value: 'Save',
      line: 4,
    },
    'en',
    'messages.en.ts',
    true,
  );
  assert.equal(
    bare.some((finding) => finding.kind === 'bare-action'),
    true,
  );

  const descriptive = inspectMessage(
    {
      key: 'control.schedule.action.save',
      localKey: 'saveButton',
      value: 'Save schedule',
      line: 4,
    },
    'en',
    'messages.en.ts',
    true,
  );
  assert.equal(
    descriptive.some((finding) => finding.kind === 'bare-action'),
    false,
  );
});

test('bare action labels are detected in every supported language', () => {
  const cases = [
    ['en', 'Save'],
    ['es', 'Guardar'],
    ['pt', 'Salvar'],
    ['fr', 'Enregistrer'],
    ['it', 'Salva'],
    ['de', 'Speichern'],
    ['ru', 'Сохранить'],
    ['zh', '保存'],
  ];

  for (const [language, value] of cases) {
    const findings = inspectMessage(
      { key: 'control.settings.save', localKey: 'settingsSave', value },
      language,
      'messages.ts',
      true,
    );
    assert.equal(
      findings.some((finding) => finding.kind === 'bare-action'),
      true,
      language,
    );
  }

  assert.equal(
    inspectMessage(
      { key: 'control.dashboard.status', localKey: 'status', value: 'Open' },
      'en',
      'messages.ts',
      true,
    ).some((finding) => finding.kind === 'bare-action'),
    false,
  );
});

test('the toast repeats the action verb in its past tense', () => {
  assert.deepEqual(checkToastVerbEcho('Publish schedule', 'Schedule published.'), {
    ok: true,
    expected: 'published',
  });
  assert.deepEqual(checkToastVerbEcho('Publish schedule', 'Schedule saved.'), {
    ok: false,
    expected: 'published',
  });
});

test('catalogue extraction reads English descriptors and translated IDs', () => {
  const english = `
    export const messages = defineMessages({
      saveButton: { id: 'control.schedule.action.save', defaultMessage: 'Save schedule' },
    });
  `;
  const spanish = `
    export const messages = {
      'control.schedule.action.save': 'Guardar calendario',
    };
  `;
  assert.deepEqual(
    extractCatalogueMessages(english, 'messages.en.ts', 'en').map(({ key, value }) => ({
      key,
      value,
    })),
    [{ key: 'control.schedule.action.save', value: 'Save schedule' }],
  );
  assert.deepEqual(
    extractCatalogueMessages(spanish, 'messages.es.ts', 'es').map(({ key, value }) => ({
      key,
      value,
    })),
    [{ key: 'control.schedule.action.save', value: 'Guardar calendario' }],
  );
});

test('email-copy extraction includes static text inside localized functions', () => {
  const source = `
    const en = { reset: { body: (name) => \`Reset password for \${name}.\` } };
    const es = { reset: { body: (name) => \`Restablecé la contraseña de \${name}.\` } };
    const COPY = { en, es };
  `;
  const messages = extractEmailCopy(source, 'email-copy.ts');
  assert.deepEqual(
    messages.map(({ language, key, value }) => ({ language, key, value })),
    [
      { language: 'en', key: 'en.reset.body', value: 'Reset password for {value}.' },
      { language: 'es', key: 'es.reset.body', value: 'Restablecé la contraseña de {value}.' },
    ],
  );
});

test('the debt register tolerates its count, requires each reduction to be recorded, and rejects growth', () => {
  const debt = new Map([['messages.en.ts', 2]]);
  const violations = (count) =>
    Array.from({ length: count }, (_, index) => ({
      file: 'messages.en.ts',
      language: 'en',
      key: `copy.${index}`,
      kind: 'uppercase',
      value: 'UPPERCASE',
    }));

  assert.deepEqual(reconcileCopyDebt(violations(2), debt), []);
  assert.equal(reconcileCopyDebt(violations(1), debt)[0].kind, 'debt-register-ratchet');
  assert.equal(reconcileCopyDebt(violations(3), debt).length, 1);
});
