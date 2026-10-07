export const TV_BACKGROUNDS = [
  'discipline',
  'neutral',
  'chroma',
  'football',
  'court',
  'transparent',
] as const;

export type TvBackground = (typeof TV_BACKGROUNDS)[number];
export type TvOverlayMode = 'lower' | 'full';

export interface TvBackgroundSelection {
  readonly background: TvBackground;
  readonly chromaKey: string;
}

// eslint-disable-next-line no-restricted-syntax -- broadcast chroma green is a fixed media-protocol color, not interface styling.
export const DEFAULT_CHROMA_KEY = '#00b140';

function isTvBackground(value: string | null): value is TvBackground {
  return value !== null && TV_BACKGROUNDS.some((background) => background === value);
}

function validChromaKey(value: string | null | undefined): string | undefined {
  return value && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

/**
 * Resolves one allowlisted background for the server-rendered TV response.
 * Query values override a route's prop/default so capture clients (OBS/vMix)
 * see the selected background in the first HTML response.
 */
export function resolveTvBackground(input: {
  readonly searchParams: URLSearchParams;
  readonly overlayMode?: TvOverlayMode;
  readonly background?: TvBackground;
  readonly chromaKey?: string | null;
}): TvBackgroundSelection {
  const queryBackground = [input.searchParams.get('bg'), input.searchParams.get('background')].find(
    isTvBackground,
  );
  const legacyOverlayChroma =
    input.overlayMode === 'lower' && validChromaKey(input.searchParams.get('chroma')) !== undefined;
  const background =
    queryBackground ??
    input.background ??
    (legacyOverlayChroma ? 'chroma' : input.overlayMode === 'lower' ? 'transparent' : 'discipline');
  const chromaKey =
    validChromaKey(input.searchParams.get('chroma')) ??
    validChromaKey(input.chromaKey) ??
    DEFAULT_CHROMA_KEY;

  return { background, chromaKey };
}
