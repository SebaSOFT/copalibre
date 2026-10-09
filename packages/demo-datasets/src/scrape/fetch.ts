import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const USER_AGENT =
  'CopaLibreDemoDatasets/1.0 (+https://github.com/SebaSOFT/copalibre; one-off cached capture for a demo dataset)';

/** The portal's own JavaScript sends these; its data endpoints answer empty or 404 without them. */
const PORTAL_ORIGIN = 'https://www.wsa.sidgad.com';

export interface FetcherOptions {
  readonly cacheDirectory: string;
  /** Minimum gap between two network requests. Defaults to 750 ms. */
  readonly minimumGapMs?: number;
  /** Re-fetch even when a cached copy exists. */
  readonly refresh?: boolean;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface FormRequest {
  readonly url: string;
  /** Sent as an `application/x-www-form-urlencoded` POST when present, otherwise a GET. */
  readonly form?: Readonly<Record<string, string>>;
}

interface CacheMetadata {
  readonly url: string;
  readonly status: number;
  readonly fetchedAt: string;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

/**
 * A polite, caching HTTP client. Every response is written to disk the first
 * time it is requested and never requested again unless `refresh` is set, so a
 * re-run of the scraper makes no network calls. Network requests are made one
 * at a time with a minimum gap between them.
 */
export class CachedFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly minimumGapMs: number;
  private lastRequestAt: number | undefined;
  networkRequests = 0;

  constructor(private readonly options: FetcherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.minimumGapMs = options.minimumGapMs ?? 750;
  }

  /** An HTML fragment from one of the portal's data endpoints. */
  async text(key: string, request: FormRequest): Promise<string> {
    const body = await this.cached(key, request, 'text');
    return body.toString('utf8');
  }

  /**
   * Like `text`, for a page the source may legitimately fail to serve (a broken game report). A failure is
   * remembered in a `.missing` marker so re-runs do not ask again, and the page is reported as absent.
   */
  async optionalText(key: string, request: FormRequest): Promise<string | undefined> {
    const marker = path.join(this.options.cacheDirectory, `${key}.missing`);
    if (!this.options.refresh) {
      try {
        await readFile(marker);
        return undefined;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    try {
      return await this.text(key, request);
    } catch (error) {
      await mkdir(path.dirname(marker), { recursive: true });
      await writeFile(marker, `${error instanceof Error ? error.message : String(error)}\n`);
      return undefined;
    }
  }

  /** An image or other binary file. */
  async binary(key: string, url: string): Promise<Buffer> {
    return this.cached(key, { url }, 'binary');
  }

  private async cached(
    key: string,
    request: FormRequest,
    kind: 'text' | 'binary',
  ): Promise<Buffer> {
    if (!SAFE_KEY.test(key)) throw new Error(`unsafe cache key "${key}"`);
    const file = path.join(this.options.cacheDirectory, key);
    if (!this.options.refresh) {
      try {
        return await readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const { body, status } = await this.network(request, kind);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    const metadata: CacheMetadata = {
      url: request.url,
      status,
      fetchedAt: new Date(this.now()).toISOString(),
    };
    await writeFile(`${file}.meta.json`, `${JSON.stringify(metadata)}\n`);
    return body;
  }

  private async network(
    request: FormRequest,
    kind: 'text' | 'binary',
  ): Promise<{ body: Buffer; status: number }> {
    if (this.lastRequestAt !== undefined) {
      const wait = this.lastRequestAt + this.minimumGapMs - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAt = this.now();
    this.networkRequests += 1;

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    let body: string | undefined;
    if (kind === 'text') {
      headers.Origin = PORTAL_ORIGIN;
      headers.Referer = `${PORTAL_ORIGIN}/`;
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    if (request.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(request.form).toString();
    }
    const response = await this.fetchImpl(request.url, {
      method: request.form ? 'POST' : 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok) throw new Error(`${request.url} answered ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0)
      throw new Error(
        `${request.url} answered an empty body (missing Origin or X-Requested-With?)`,
      );
    return { body: bytes, status: response.status };
  }
}
