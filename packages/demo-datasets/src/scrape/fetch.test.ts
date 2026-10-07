import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CachedFetcher, USER_AGENT } from './fetch.js';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function harness(responses: Array<Response | Error> = []) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let clock = 1_000;
  const queue = [...responses];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift() ?? new Response('<p>ok</p>');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const make = async (options: { refresh?: boolean; minimumGapMs?: number } = {}) => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), 'demo-cache-'));
    return {
      cacheDirectory,
      fetcher: new CachedFetcher({
        cacheDirectory,
        fetchImpl,
        now: () => clock,
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
        },
        ...options,
      }),
    };
  };
  return { calls, sleeps, make, advance: (ms: number) => (clock += ms) };
}

describe('CachedFetcher', () => {
  it('sends the portal headers on a form POST and caches the body with metadata', async () => {
    const { calls, make } = harness([new Response('<table></table>')]);
    const { fetcher, cacheDirectory } = await make();
    const html = await fetcher.text('calendar/idc-273.html', {
      url: 'https://example.test/cal.php',
      form: { idc: '273', lang: 'es' },
    });
    expect(html).toBe('<table></table>');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('idc=273&lang=es');
    expect(calls[0]?.init.headers).toMatchObject({
      'User-Agent': USER_AGENT,
      Origin: 'https://www.wsa.sidgad.com',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const meta = JSON.parse(
      await readFile(path.join(cacheDirectory, 'calendar/idc-273.html.meta.json'), 'utf8'),
    );
    expect(meta).toMatchObject({ url: 'https://example.test/cal.php', status: 200 });
  });

  it('makes no network request when the cache is populated', async () => {
    const { calls, make } = harness();
    const { fetcher, cacheDirectory } = await make();
    await fetcher.text('list.html', { url: 'https://example.test/list.php' });
    const again = new CachedFetcher({
      cacheDirectory,
      fetchImpl: (() => {
        throw new Error('network used');
      }) as unknown as typeof fetch,
    });
    expect(await again.text('list.html', { url: 'https://example.test/list.php' })).toBe(
      '<p>ok</p>',
    );
    expect(calls).toHaveLength(1);
    expect(again.networkRequests).toBe(0);
  });

  it('refetches when refresh is set', async () => {
    const { calls, make } = harness([new Response('one'), new Response('two')]);
    const first = await make();
    await first.fetcher.text('a.html', { url: 'https://example.test/a' });
    const refreshing = new CachedFetcher({
      cacheDirectory: first.cacheDirectory,
      refresh: true,
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('two');
      }) as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    expect(await refreshing.text('a.html', { url: 'https://example.test/a' })).toBe('two');
    expect(calls).toHaveLength(2);
  });

  it('waits out the minimum gap between network requests only', async () => {
    const { sleeps, make, advance } = harness();
    const { fetcher } = await make({ minimumGapMs: 750 });
    await fetcher.text('a.html', { url: 'https://example.test/a' });
    advance(200);
    await fetcher.text('b.html', { url: 'https://example.test/b' });
    advance(5_000);
    await fetcher.text('c.html', { url: 'https://example.test/c' });
    await fetcher.text('a.html', { url: 'https://example.test/a' });
    expect(sleeps).toEqual([550]);
    expect(fetcher.networkRequests).toBe(3);
  });

  it('uses a GET without portal headers for images and returns the bytes', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { calls, make } = harness([new Response(png)]);
    const { fetcher } = await make();
    expect((await fetcher.binary('emblems/1.png', 'https://example.test/1.png')).equals(png)).toBe(
      true,
    );
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers).toEqual({ 'User-Agent': USER_AGENT });
  });

  it('does not cache failures, empty bodies or network errors', async () => {
    const { make } = harness([
      new Response('nope', { status: 404 }),
      new Response('', { status: 200 }),
      new Error('socket hang up'),
    ]);
    const { fetcher, cacheDirectory } = await make({ minimumGapMs: 0 });
    await expect(fetcher.text('x.html', { url: 'https://example.test/x' })).rejects.toThrow('404');
    await expect(fetcher.text('x.html', { url: 'https://example.test/x' })).rejects.toThrow(
      'empty body',
    );
    await expect(fetcher.text('x.html', { url: 'https://example.test/x' })).rejects.toThrow(
      'socket',
    );
    await expect(readFile(path.join(cacheDirectory, 'x.html'))).rejects.toThrow();
  });

  it('rejects cache keys that could escape the cache directory', async () => {
    const { make } = harness();
    const { fetcher } = await make();
    for (const key of ['../x.html', '/abs.html', 'a//b.html', 'A.html', '']) {
      await expect(fetcher.text(key, { url: 'https://example.test/' })).rejects.toThrow(
        'unsafe cache key',
      );
    }
  });

  it('surfaces cache read errors other than a missing file', async () => {
    const { make } = harness();
    const { fetcher, cacheDirectory } = await make();
    await fetcher.text('dir/a.html', { url: 'https://example.test/a' });
    await expect(fetcher.text('dir', { url: 'https://example.test/a' })).rejects.toThrow();
    expect(cacheDirectory).toContain('demo-cache-');
  });

  it('remembers a page the source cannot serve and does not ask again', async () => {
    const { calls, make } = harness([new Response('boom', { status: 500 })]);
    const { fetcher, cacheDirectory } = await make();
    const request = { url: 'https://example.test/report' };
    expect(await fetcher.optionalText('games/game-1.html', request)).toBeUndefined();
    expect(await fetcher.optionalText('games/game-1.html', request)).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(
      await readFile(path.join(cacheDirectory, 'games/game-1.html.missing'), 'utf8'),
    ).toContain('500');
  });

  it('returns the page when the optional request succeeds and retries on refresh', async () => {
    const { make } = harness([new Response('<p>report</p>')]);
    const { fetcher } = await make();
    expect(await fetcher.optionalText('games/game-2.html', { url: 'https://example.test/r' })).toBe(
      '<p>report</p>',
    );
    const retry = harness([new Response('x', { status: 500 }), new Response('<p>back</p>')]);
    const first = await retry.make();
    await first.fetcher.optionalText('g.html', { url: 'https://example.test/g' });
    const refreshing = new CachedFetcher({
      cacheDirectory: first.cacheDirectory,
      refresh: true,
      minimumGapMs: 0,
      fetchImpl: (async () => new Response('<p>back</p>')) as unknown as typeof fetch,
    });
    expect(await refreshing.optionalText('g.html', { url: 'https://example.test/g' })).toBe(
      '<p>back</p>',
    );
  });

  it('surfaces marker read errors other than a missing file', async () => {
    const { make } = harness();
    const { fetcher } = await make();
    await fetcher.text('dir/a.html', { url: 'https://example.test/a' });
    await expect(
      fetcher.optionalText('dir/a.html/x', { url: 'https://example.test/a' }),
    ).rejects.toThrow();
  });

  it('uses real time by default to space requests', async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), 'demo-cache-'));
    const fetcher = new CachedFetcher({
      cacheDirectory,
      minimumGapMs: 25,
      fetchImpl: (async () => new Response('<p>ok</p>')) as unknown as typeof fetch,
    });
    const started = Date.now();
    await fetcher.text('a.html', { url: 'https://example.test/a' });
    await fetcher.text('b.html', { url: 'https://example.test/b' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    expect(fetcher.networkRequests).toBe(2);
  });
});
