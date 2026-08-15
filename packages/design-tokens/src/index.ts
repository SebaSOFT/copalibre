/**
 * @copalibre/design-tokens — one token source, generated into CSS custom
 * properties for the Astro surfaces and a Tailwind theme for the React control
 * app. Hand-duplicating them is how a "live" cyan ends up two shades
 * apart on two screens showing the same match.
 */

export {
  COLOR_PRIMITIVES,
  TYPOGRAPHY,
  FONT_WEIGHTS,
  SPACING,
  RADIUS,
  MOTION,
  TOUCH_TARGET,
  type ColorPrimitive,
} from './primitives.js';
export {
  SEMANTIC_COLORS,
  PROTECTED_TOKENS,
  resolveSemantic,
  isProtected,
  type SemanticColor,
  type SemanticToken,
} from './semantic.js';
export {
  BUTTON_VARIANTS,
  CARD_STATES,
  FOCUS_RING,
  assertBadge,
  BadgeContractError,
  type BadgeSpec,
  type ButtonVariant,
  type ButtonTokens,
} from './components.js';
export {
  FORBIDDEN,
  scanForForbidden,
  formatHits,
  type ForbiddenPattern,
  type ForbiddenHit,
} from './forbidden.js';
export { generateCss } from './generate/css.js';
export {
  generateTailwindTheme,
  generateTailwindModule,
  type TailwindTheme,
} from './generate/tailwind.js';
export { generateStyleGuide } from './generate/style-guide.js';
