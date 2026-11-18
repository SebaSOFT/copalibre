import { createInterface } from 'node:readline';

/**
 * Line-based questions for the commands that configure an installation (`init`, `doctor`): a
 * numbered choice, a secret typed without echo, a yes/no and a validated value. Line-based so they
 * work over SSH and in a recorded terminal; no full-screen UI.
 */
export interface Prompts {
  /** A numbered list; Enter keeps `current` when it is one of the options. */
  select<T extends string>(
    question: string,
    options: readonly { readonly value: T; readonly label: string }[],
    current?: T,
  ): Promise<T>;
  /** Read without echo. Empty is accepted only when `allowEmpty`, and returns ''. */
  secret(question: string, options?: { readonly allowEmpty?: boolean }): Promise<string>;
  confirm(question: string, defaultAnswer?: boolean): Promise<boolean>;
  /**
   * `validate` returns the reason a value is refused, or undefined to accept it. Empty is accepted
   * only when `allowEmpty`, and is not validated.
   */
  text(
    question: string,
    options?: {
      readonly default?: string;
      readonly allowEmpty?: boolean;
      readonly validate?: (value: string) => string | undefined;
    },
  ): Promise<string>;
  close(): void;
}

export class InputEndedError extends Error {
  constructor() {
    super('The input ended before every question was answered');
  }
}

/**
 * Lines are queued as they arrive rather than read with `question()`, so answers piped or typed
 * ahead are never lost between two questions.
 */
export function createPrompts(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  terminal: boolean = (input as { isTTY?: boolean }).isTTY === true,
): Prompts {
  const readline = createInterface({ input, output, terminal });
  readline.setPrompt('');
  const lines: string[] = [];
  const waiting: { resolve: (line: string) => void; reject: (error: Error) => void }[] = [];
  let ended = false;
  readline.on('line', (line) => {
    const next = waiting.shift();
    if (next) next.resolve(line);
    else lines.push(line);
  });
  readline.on('close', () => {
    ended = true;
    for (const next of waiting.splice(0)) next.reject(new InputEndedError());
  });

  // While a secret is typed, readline's echo of the line is dropped; when it redraws the line
  // (a backspace in a terminal) it still shows the question, never what was typed.
  let masking = false;
  let prompt = '';
  const echo = readline as unknown as { _writeToOutput: (value: string) => void };
  const original = echo._writeToOutput.bind(readline);
  echo._writeToOutput = (value: string) => {
    if (!masking || value === '\r\n' || value === '\n') original(value);
    else if (prompt && value.startsWith(prompt)) original(prompt);
  };

  const write = (value: string): void => {
    output.write(value);
  };
  /** The question becomes readline's prompt, so a terminal redraw keeps it on the line. */
  const showQuestion = (question: string): void => {
    if (ended) throw new InputEndedError();
    prompt = question;
    readline.setPrompt(question);
    readline.prompt(true);
  };
  const nextLine = (): Promise<string> => {
    const line = lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    if (ended) return Promise.reject(new InputEndedError());
    return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
  };
  const ask = async (question: string): Promise<string> => {
    showQuestion(question);
    return (await nextLine()).trim();
  };

  return {
    async select(question, options, current) {
      write(`${question}\n`);
      options.forEach((option, index) =>
        write(`  ${index + 1}. ${option.label}${option.value === current ? ' (current)' : ''}\n`),
      );
      const kept = options.find((option) => option.value === current);
      const hint = kept ? ` [${options.indexOf(kept) + 1}]` : '';
      for (;;) {
        const answer = await ask(`Choose 1-${options.length}${hint}: `);
        if (answer === '' && kept) return kept.value;
        const index = Number(answer) - 1;
        const chosen = Number.isInteger(index) ? options[index] : undefined;
        if (chosen) return chosen.value;
        write(`Type a number from 1 to ${options.length}.\n`);
      }
    },

    async secret(question, options = {}) {
      for (;;) {
        showQuestion(question);
        masking = true;
        let answer: string;
        try {
          answer = (await nextLine()).trim();
        } finally {
          masking = false;
        }
        if (answer !== '' || options.allowEmpty) return answer;
        write('A value is required.\n');
      }
    },

    async confirm(question, defaultAnswer = true) {
      for (;;) {
        const answer = (
          await ask(`${question} ${defaultAnswer ? '[Y/n]' : '[y/N]'} `)
        ).toLowerCase();
        if (answer === '') return defaultAnswer;
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
        write('Answer y or n.\n');
      }
    },

    async text(question, options = {}) {
      const suffix = options.default ? ` [${options.default}]` : '';
      for (;;) {
        const answer = (await ask(`${question}${suffix}: `)) || options.default || '';
        if (answer === '' && options.allowEmpty) return '';
        if (answer === '') {
          write('A value is required.\n');
          continue;
        }
        const refusal = options.validate?.(answer);
        if (refusal === undefined) return answer;
        write(`${refusal}\n`);
      }
    },

    close() {
      readline.close();
    },
  };
}
