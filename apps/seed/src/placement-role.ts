/**
 * The part a placement game plays in its cup, read from the round label the source publishes.
 *
 * `3º puesto` is `place-3` and `5º al 8º puesto` is `places-5-8`. Every other label (a jornada,
 * quarter-finals, semi-finals, the final) is one of the generated bracket's own matches and has no
 * role: the bracket already knows where those belong.
 */
export function placementRole(roundLabel: string): string | undefined {
  const range = /^(\d+)\s*º\s+al\s+(\d+)\s*º\s+puesto$/iu.exec(roundLabel.trim());
  if (range) return `places-${range[1]}-${range[2]}`;
  const single = /^(\d+)\s*º\s+puesto$/iu.exec(roundLabel.trim());
  return single ? `place-${single[1]}` : undefined;
}
