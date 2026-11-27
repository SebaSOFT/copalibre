/** Extract the SVG body and normalize package markup to the shared icon contract. */
export function normalizeIconSvg(markup: string, strokeWidth: number): string {
  return markup
    .replace(/^[\s\S]*?<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<path\b(?=[^>]*\bd=["']M0 0h24v24H0z["'])[^>]*(?:\/>|>\s*<\/path>)/g, '')
    .replace(/\bstroke-width=(["'])[^"']+\1/g, `stroke-width="${strokeWidth}"`);
}
