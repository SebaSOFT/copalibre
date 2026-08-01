import { homePath, publicPath, type RouteInput } from './paths.js';

/**
 * What a crawler is told about (0020).
 *
 * The sitemap is built from the *builder*, not from a list somebody maintains,
 * so a route that cannot be constructed cannot be advertised. `/control` and
 * `/tv` are not omitted by remembering to omit them — they are simply never
 * produced by `publicPath`.
 */

export interface SitemapEntry {
  readonly input: RouteInput;
  readonly lastModified?: string;
  readonly changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
}

export function buildSitemap(origin: string, entries: readonly SitemapEntry[]): string {
  const urls = [
    `  <url><loc>${escapeXml(join(origin, homePath()))}</loc></url>`,
    ...entries.map((entry) => {
      const parts = [`<loc>${escapeXml(join(origin, publicPath(entry.input)))}</loc>`];
      if (entry.lastModified) parts.push(`<lastmod>${escapeXml(entry.lastModified)}</lastmod>`);
      if (entry.changeFrequency) {
        parts.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
      }
      return `  <url>${parts.join('')}</url>`;
    }),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Operator and venue surfaces are disallowed by name.
 *
 * Not a security control — anything reachable is reachable — but a search
 * result that drops a spectator onto an operator console is a support ticket,
 * and a TV overlay indexed out of context is a screenshot nobody can explain.
 */
export function buildRobots(origin: string): string {
  return [
    'User-agent: *',
    'Disallow: /control/',
    'Disallow: /tv/',
    'Disallow: /events/',
    'Allow: /',
    '',
    `Sitemap: ${join(origin, '/sitemap.xml')}`,
    '',
  ].join('\n');
}

function join(origin: string, path: string): string {
  return `${origin.replace(/\/$/, '')}${path}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
