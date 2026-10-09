import { describe, expect, it, vi } from 'vitest';
import { MissingObjectLog } from './missing-object-log.js';

function setup(recorded: string | undefined, active = 's3') {
  const warn = vi.fn();
  const lookup = vi.fn(async () => recorded);
  return { warn, lookup, log: new MissingObjectLog({ warn }, lookup, () => active) };
}

describe('MissingObjectLog', () => {
  it('names the profile the object was recorded under when it differs from the active one', async () => {
    const { warn, log } = setup('filesystem');
    await log.report('modules/rink-hockey/1.0.0/background.jpg');

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('modules/rink-hockey/1.0.0/background.jpg');
    expect(message).toContain('"filesystem"');
    expect(message).toContain('"s3"');
  });

  it('says the object is absent when the recorded profile is the active one', async () => {
    const { warn, log } = setup('s3');
    await log.report('modules/a/1.0.0/b.jpg');
    expect(String(warn.mock.calls[0]?.[0])).toContain('absent from the active "s3" storage');
  });

  it('logs once per key, however many requests miss it', async () => {
    const { warn, lookup, log } = setup('filesystem');
    await log.report('k1');
    await log.report('k1');
    await log.report('k1');
    await log.report('k2');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('still logs when the record lookup fails', async () => {
    const warn = vi.fn();
    const log = new MissingObjectLog(
      { warn },
      async () => {
        throw new Error('db down');
      },
      () => 's3',
    );
    await log.report('k');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
