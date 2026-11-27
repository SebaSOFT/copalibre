import type {
  TableProjectionResponse,
  TablePromotionBandResponse,
} from '../dto/table-projections.dto.js';

export interface PublicPromotionBandSeed {
  readonly entrantId: string;
  readonly seed: number;
}

export interface PublicPromotionBand {
  readonly label: string;
  readonly sourceZoneName?: string;
  readonly index: number;
  readonly firstSeed: number;
  readonly lastSeed: number;
  readonly seeds: readonly PublicPromotionBandSeed[];
}

/** Apply only configured, evaluated bands to matching entrant rows. */
export function withPublicPromotionBands(
  projection: TableProjectionResponse,
  bands: readonly PublicPromotionBand[],
): TableProjectionResponse {
  if (bands.length === 0) return projection;

  const byEntrant = new Map<
    string,
    Pick<
      TableProjectionResponse['rows'][number],
      'promotionBandLabel' | 'promotionBandIndex' | 'promotionSeed'
    >
  >();
  for (const band of bands) {
    for (const seed of band.seeds) {
      byEntrant.set(seed.entrantId, {
        promotionBandLabel: band.label,
        promotionBandIndex: band.index,
        promotionSeed: seed.seed,
      });
    }
  }

  const decorate = (rows: TableProjectionResponse['rows']) =>
    rows.map((row) => {
      const promotion = row.entrantId === undefined ? undefined : byEntrant.get(row.entrantId);
      return promotion === undefined ? row : { ...row, ...promotion };
    });

  const promotionBands: TablePromotionBandResponse[] = bands.map(
    ({ label, sourceZoneName, index, firstSeed, lastSeed }) => ({
      label,
      ...(sourceZoneName === undefined ? {} : { sourceZoneName }),
      index,
      firstSeed,
      lastSeed,
    }),
  );

  return {
    ...projection,
    rows: decorate(projection.rows),
    ...(projection.segments === undefined
      ? {}
      : {
          segments: projection.segments.map((segment) => ({
            ...segment,
            rows: decorate(segment.rows),
          })),
        }),
    promotionBands,
  };
}
