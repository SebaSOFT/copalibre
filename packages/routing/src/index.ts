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
export { buildSitemap, buildRobots, type SitemapEntry } from './discovery.js';
export { parseControlPath, type ControlRoute } from './control-path-parser.js';
