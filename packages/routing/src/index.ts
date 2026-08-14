/**
 * @copalibre/routing — one place that knows what a thing's URL is, on every
 * surface (0020).
 */

export {
  publicPath,
  homePath,
  controlPath,
  tvPath,
  publicStreamPath,
  tvStreamPath,
  viewQuery,
  validateRouteInput,
  RouteError,
  PRIMARY_LOCALE,
  type RouteInput,
  type ViewMode,
} from './paths.js';
/**
 * @deprecated Moved to `@copalibre/domain`'s `aliasing.ts` (0080) — alias
 * redirect resolution is domain logic, not URL routing. Re-exported here for
 * one release so this package's existing consumers need no simultaneous
 * edit; import from `@copalibre/domain` directly instead.
 */
export { resolveAlias, type AliasRedirect, type AliasResolution } from '@copalibre/domain';
export { buildSitemap, buildRobots, type SitemapEntry } from './discovery.js';
export { parseControlPath, type ControlRoute } from './control-path-parser.js';
