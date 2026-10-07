import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withCutoutCache } from './cutout-cache.js';

describe('withCutoutCache', () => {
  it('runs the cutout once per distinct image and serves the stored result afterwards', async () => {
    const directory = path.join(await mkdtemp(path.join(os.tmpdir(), 'cutout-cache-')), 'cutouts');
    const calls: string[] = [];
    const cached = withCutoutCache(directory, async (png, label) => {
      calls.push(label);
      return Buffer.concat([Buffer.from('cut:'), png]);
    });

    const first = await cached(Buffer.from('one'), 'a');
    expect(first.toString()).toBe('cut:one');
    expect((await cached(Buffer.from('one'), 'a again')).toString()).toBe('cut:one');
    expect((await cached(Buffer.from('two'), 'b')).toString()).toBe('cut:two');
    expect(calls).toEqual(['a', 'b']);

    // a new wrapper over the same directory (a later scraper run) does not run the model either
    const later = withCutoutCache(directory, async () => {
      throw new Error('model used');
    });
    expect((await later(Buffer.from('two'), 'b')).toString()).toBe('cut:two');
  });
});
