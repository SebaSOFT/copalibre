export const PERFORMANCE_BUDGETS = Object.freeze({
  lcpMs: 2500,
  cls: 0.1,
  inpMs: 200,
  compressedScriptBytes: 150 * 1024,
  transferBytes: 1024 * 1024,
});

export const TIMING_TOLERANCE = 1.05;

export const PERFORMANCE_ROUTES = Object.freeze([
  '/panamericano-demo/tournaments/panamericano-clubes-2025',
  '/panamericano-demo/tournaments/panamericano-clubes-2025/matches',
  '/panamericano-demo/tournaments/panamericano-clubes-2025/stages/1/matches/1',
]);

export function withTimingTolerance(value) {
  return Math.ceil(value * TIMING_TOLERANCE);
}
