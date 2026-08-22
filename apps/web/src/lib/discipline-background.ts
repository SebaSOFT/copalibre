export interface PublicObjectReference {
  readonly key: string;
}

export const DISCIPLINE_BACKGROUND_OPACITY = 0.1;

export interface DisciplineBackground {
  readonly url: string;
  readonly opacity: typeof DISCIPLINE_BACKGROUND_OPACITY;
}

export function selectDisciplineBackground(
  images: readonly PublicObjectReference[] | undefined,
  random: () => number = Math.random,
): DisciplineBackground | undefined {
  if (!images || images.length === 0) return undefined;
  const index = Math.min(images.length - 1, Math.max(0, Math.floor(random() * images.length)));
  const reference = images[index];
  if (!reference) return undefined;
  return {
    url: `/objects/discipline-background-image?key=${encodeURIComponent(reference.key)}`,
    opacity: DISCIPLINE_BACKGROUND_OPACITY,
  };
}
