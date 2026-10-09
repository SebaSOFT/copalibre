export interface PublicObjectReference {
  readonly key: string;
}

export const DISCIPLINE_BACKGROUND_OPACITY = 0.1;

/** The public pages' backdrop: fainter than the TV's, and blurred so it reads as atmosphere. */
export const PUBLIC_DISCIPLINE_BACKGROUND_OPACITY = 0.06;
export const PUBLIC_DISCIPLINE_BACKGROUND_BLUR_PX = 8;

export interface DisciplineBackground {
  readonly url: string;
  readonly opacity: number;
  /** Gaussian blur radius in px; absent for a backdrop drawn sharp (the TV's own is blurred in its stylesheet). */
  readonly blurPx?: number;
}

export interface DisciplineBackgroundStrength {
  readonly opacity: number;
  readonly blurPx?: number;
}

export function selectDisciplineBackground(
  images: readonly PublicObjectReference[] | undefined,
  random: () => number = Math.random,
  strength: DisciplineBackgroundStrength = { opacity: DISCIPLINE_BACKGROUND_OPACITY },
): DisciplineBackground | undefined {
  if (!images || images.length === 0) return undefined;
  const index = Math.min(images.length - 1, Math.max(0, Math.floor(random() * images.length)));
  const reference = images[index];
  if (!reference) return undefined;
  return {
    url: `/objects/discipline-background-image?key=${encodeURIComponent(reference.key)}`,
    opacity: strength.opacity,
    ...(strength.blurPx === undefined ? {} : { blurPx: strength.blurPx }),
  };
}

/** The one backdrop of a public page: 6 % and blurred, picked at random among the discipline's images. */
export function selectPublicDisciplineBackground(
  images: readonly PublicObjectReference[] | undefined,
  random: () => number = Math.random,
): DisciplineBackground | undefined {
  return selectDisciplineBackground(images, random, {
    opacity: PUBLIC_DISCIPLINE_BACKGROUND_OPACITY,
    blurPx: PUBLIC_DISCIPLINE_BACKGROUND_BLUR_PX,
  });
}
