/**
 * The contrast contract, made enforceable.
 *
 * `copalibre-visual-identity.md`, "Contrast contract": normal text >= 4.5:1,
 * large text >= 3:1, and essential non-text indicators >= 3:1. Until now that
 * was a rule stated in prose and checked by eye, which is how a surface level
 * gets added with text nobody can read on it.
 *
 * The WCAG 2.x formula is implemented here rather than taken from a package
 * deliberately: it is eight lines, it operates on primitives this package
 * already owns, and the contrast contract is this package's own subject matter
 * rather than a general-purpose utility borrowed into it.
 */

/** WCAG 2.x relative luminance of an `#rrggbb` value. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` values, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** The gates the identity document sets, named so a failure reads as a rule. */
export const CONTRAST_GATES = {
  normalText: 4.5,
  largeText: 3,
  nonTextIndicator: 3,
} as const;
