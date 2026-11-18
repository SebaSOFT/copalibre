import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { envValue, updateEnvFile } from './env-file.js';

const NOW = new Date('2026-11-17T12:30:00.123Z');
const ORIGINAL = [
  '# CopaLibre installation settings',
  'COPALIBRE_APP_URL=https://torneos.liga.example',
  '',
  '# Email',
  'COPALIBRE_EMAIL_PROVIDER=smtp',
  'COPALIBRE_SMTP_URL=smtp://host.docker.internal:1025',
  'COPALIBRE_EMAIL_FROM=noreply@copalibre.local',
  'MY_OWN_SETTING="keep me"',
  '',
].join('\n');

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'copalibre-env-file-'));
  path = join(directory, '.env');
  await writeFile(path, ORIGINAL, { mode: 0o644 });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const mode = async (file: string): Promise<number> => (await stat(file)).mode & 0o777;

describe('updateEnvFile', () => {
  it('replaces values in place and appends new keys, keeping comments and other keys', async () => {
    const result = await updateEnvFile(
      path,
      {
        COPALIBRE_EMAIL_PROVIDER: 'resend',
        COPALIBRE_RESEND_API_KEY: 're_123',
        COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
      },
      NOW,
    );
    expect(result.changed).toEqual([
      'COPALIBRE_EMAIL_PROVIDER',
      'COPALIBRE_RESEND_API_KEY',
      'COPALIBRE_EMAIL_FROM',
    ]);
    expect(await readFile(path, 'utf8')).toBe(
      [
        '# CopaLibre installation settings',
        'COPALIBRE_APP_URL=https://torneos.liga.example',
        '',
        '# Email',
        'COPALIBRE_EMAIL_PROVIDER=resend',
        'COPALIBRE_SMTP_URL=smtp://host.docker.internal:1025',
        'COPALIBRE_EMAIL_FROM=torneos@liga.example',
        'MY_OWN_SETTING="keep me"',
        'COPALIBRE_RESEND_API_KEY=re_123',
        '',
      ].join('\n'),
    );
  });

  it('keeps the previous file as a backup, and both readable by the owner only', async () => {
    const { backup = '' } = await updateEnvFile(path, { COPALIBRE_EMAIL_PROVIDER: 'brevo' }, NOW);
    expect(backup).toBe(`${path}.2026-11-17T12-30-00-123Z.bak`);
    expect(await readFile(backup, 'utf8')).toBe(ORIGINAL);
    expect(await mode(backup)).toBe(0o600);
    expect(await mode(path)).toBe(0o600);
  });

  it('writes nothing, not even a backup, when every value is already set', async () => {
    const result = await updateEnvFile(path, { COPALIBRE_EMAIL_PROVIDER: 'smtp' }, NOW);
    expect(result).toEqual({ changed: [] });
    expect(await readdir(directory)).toEqual(['.env']);
  });

  it('leaves one assignment of a key that appeared twice', async () => {
    await writeFile(path, 'A=1\nB=2\nA=3\n');
    await updateEnvFile(path, { A: '4' }, NOW);
    expect(await readFile(path, 'utf8')).toBe('A=4\nB=2\n');
  });

  it('adds the line break a file without one was missing', async () => {
    await writeFile(path, 'A=1');
    await updateEnvFile(path, { B: '2' }, NOW);
    expect(await readFile(path, 'utf8')).toBe('A=1\nB=2\n');
  });

  it('reads back every value as written', async () => {
    const values = {
      SMTP: 'smtp://user%40liga:p%24ss@smtp.liga.example:587',
      KEY: 'abc$def ghi#jkl',
      QUOTE: "it's here",
    };
    await updateEnvFile(path, values, NOW);
    expect(parseEnv(await readFile(path, 'utf8'))).toMatchObject(values);
  });
});

describe('envValue', () => {
  it('quotes only when it must, and refuses what cannot be read back the same', () => {
    expect(envValue('https://liga.example/?a=1&b=2')).toBe('https://liga.example/?a=1&b=2');
    expect(envValue('has $ sign')).toBe("'has $ sign'");
    expect(envValue("it's")).toBe('"it\'s"');
    expect(() => envValue("it's $5")).toThrow('cannot be stored in .env');
    expect(() => envValue('two\nlines')).toThrow('cannot be stored in .env');
  });
});
