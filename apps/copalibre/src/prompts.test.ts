import { PassThrough } from 'node:stream';
import { createPrompts, InputEndedError, type Prompts } from './prompts.js';

/** Prompts over in-memory streams, with `answers` typed ahead, one per line. */
function scripted(
  answers: readonly string[],
  terminal = false,
): {
  readonly prompts: Prompts;
  readonly output: () => string;
  readonly input: PassThrough;
} {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => {
    written += chunk.toString();
  });
  const prompts = createPrompts(input, output, terminal);
  for (const answer of answers) input.write(`${answer}\n`);
  return { prompts, output: () => written, input };
}

const PROVIDERS = [
  { value: 'smtp', label: 'SMTP server' },
  { value: 'resend', label: 'Resend' },
  { value: 'brevo', label: 'Brevo' },
] as const;

describe('select', () => {
  it('lists the options numbered, marks the current one, and returns the chosen value', async () => {
    const { prompts, output } = scripted(['2']);
    await expect(prompts.select('Email provider:', PROVIDERS, 'smtp')).resolves.toBe('resend');
    prompts.close();
    expect(output()).toContain('  1. SMTP server (current)\n  2. Resend\n  3. Brevo\n');
    expect(output()).toContain('Choose 1-3 [1]: ');
  });

  it('keeps the current value on Enter', async () => {
    const { prompts } = scripted(['']);
    await expect(prompts.select('Email provider:', PROVIDERS, 'brevo')).resolves.toBe('brevo');
    prompts.close();
  });

  it('asks again after an out-of-range number, and after Enter with no current value', async () => {
    const { prompts, output } = scripted(['4', '', 'x', '3']);
    await expect(prompts.select('Email provider:', PROVIDERS)).resolves.toBe('brevo');
    prompts.close();
    expect(output().match(/Type a number from 1 to 3\./g)).toHaveLength(3);
  });
});

describe('secret', () => {
  it('never writes what was typed', async () => {
    const { prompts, output, input } = scripted([], true);
    const answer = prompts.secret('Resend API key: ');
    input.write('re_secret_key\n');
    await expect(answer).resolves.toBe('re_secret_key');
    prompts.close();
    expect(output()).toContain('Resend API key: ');
    expect(output()).not.toContain('re_secret_key');
    expect(output()).not.toContain('*');
  });

  it('redraws only the question when the operator corrects what they typed', async () => {
    const { prompts, output, input } = scripted([], true);
    const answer = prompts.secret('Key: ');
    input.write('abc\x7fd\n');
    await expect(answer).resolves.toBe('abd');
    prompts.close();
    expect(output()).not.toMatch(/ab/);
  });

  it('asks again for an empty value unless empty is allowed', async () => {
    const { prompts, output } = scripted(['', 'key', '']);
    await expect(prompts.secret('Key: ')).resolves.toBe('key');
    await expect(prompts.secret('Key: ', { allowEmpty: true })).resolves.toBe('');
    prompts.close();
    expect(output()).toContain('A value is required.');
  });
});

describe('confirm', () => {
  it('takes the default on Enter and reads yes and no', async () => {
    const { prompts, output } = scripted(['', '', 'maybe', 'YES', 'n']);
    await expect(prompts.confirm('Configure email now?')).resolves.toBe(true);
    await expect(prompts.confirm('Restart?', false)).resolves.toBe(false);
    await expect(prompts.confirm('Send a test?')).resolves.toBe(true);
    await expect(prompts.confirm('Again?')).resolves.toBe(false);
    prompts.close();
    expect(output()).toContain('Configure email now? [Y/n] ');
    expect(output()).toContain('Restart? [y/N] ');
    expect(output()).toContain('Answer y or n.');
  });
});

describe('text', () => {
  it('offers the default, and asks again until the value is accepted', async () => {
    const { prompts, output } = scripted(['', 'nobody', 'ops@liga.example']);
    await expect(prompts.text('Public URL', { default: 'http://localhost:8080' })).resolves.toBe(
      'http://localhost:8080',
    );
    await expect(
      prompts.text('Send it to', {
        validate: (value) => (value.includes('@') ? undefined : 'Type an email address.'),
      }),
    ).resolves.toBe('ops@liga.example');
    prompts.close();
    expect(output()).toContain('Public URL [http://localhost:8080]: ');
    expect(output()).toContain('Type an email address.');
  });

  it('requires a value when there is no default, unless empty is allowed', async () => {
    const { prompts, output } = scripted(['', 'mg.liga.example', '']);
    await expect(prompts.text('Sending domain')).resolves.toBe('mg.liga.example');
    await expect(
      prompts.text('Username', { allowEmpty: true, validate: () => 'never' }),
    ).resolves.toBe('');
    prompts.close();
    expect(output()).toContain('A value is required.');
  });
});

describe('the end of the input', () => {
  it('fails a question it cannot answer instead of waiting forever', async () => {
    const { prompts, input } = scripted([]);
    const pending = prompts.confirm('Configure email now?');
    input.end();
    await expect(pending).rejects.toBeInstanceOf(InputEndedError);
    await expect(prompts.text('Anything')).rejects.toBeInstanceOf(InputEndedError);
  });
});
