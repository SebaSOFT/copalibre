/**
 * The Broadcaster Studio's own pure logic (openspec 0300): turning an issued
 * display token's launch URL into a ready-to-paste OBS Browser Source URL.
 * `mode`/`chroma` are query params the overlay route already understands
 * (`?mode=`, `?chroma=`, verified against `[match].astro`/`TvLayout.astro`)
 * — this needed no new backend or route support, only a caller.
 */

export type BroadcastOverlayMode = 'overlay-lower' | 'overlay-full';
export type BroadcastChroma = 'transparent' | 'green' | 'magenta' | 'dark';

/** `transparent` sends no `chroma` param at all — the overlay's own natural background. */
const CHROMA_HEX: Readonly<Record<Exclude<BroadcastChroma, 'transparent'>, string>> = {
  green: '00FF00',
  magenta: 'FF00FF',
  dark: '0B0F1A',
};

export const BROADCAST_CHROMA_OPTIONS: readonly BroadcastChroma[] = [
  'transparent',
  'green',
  'magenta',
  'dark',
];

/**
 * Appends `mode`/`chroma` to an already-issued display token's launch URL —
 * never invents a new URL shape, and preserves the `token` param (and any
 * other) the backend already put there.
 */
export function buildOverlayUrl(
  issuedUrl: string,
  mode: BroadcastOverlayMode,
  chroma: BroadcastChroma,
): string {
  const url = new URL(issuedUrl);
  url.searchParams.set('mode', mode);
  if (chroma === 'transparent') url.searchParams.delete('chroma');
  else url.searchParams.set('chroma', CHROMA_HEX[chroma]);
  return url.toString();
}

export interface ObsResolutionPreset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

/** Informational only (design.md Decision 1) — never encoded into the URL; OBS's own Browser Source dialog has its own width/height/FPS fields. */
export const OBS_RESOLUTION_PRESETS: readonly ObsResolutionPreset[] = [
  { id: '1080p', width: 1920, height: 1080, fps: 60 },
  { id: '720p', width: 1280, height: 720, fps: 60 },
  { id: 'vertical', width: 1080, height: 1920, fps: 60 },
];
