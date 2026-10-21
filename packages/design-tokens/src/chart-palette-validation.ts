import { contrastRatio } from './contrast.js';

const LIGHTNESS_BAND = { min: 0.48, max: 0.67 } as const;
const CHROMA_FLOOR = 0.08;
const NORMAL_VISION_FLOOR = 15;
const COLOR_BLIND_FLOOR = 8;
const CONTRAST_FLOOR = 3;

type Vector = readonly [number, number, number];
type Matrix = readonly [Vector, Vector, Vector];

const COLOR_VISION_MATRICES: Readonly<Record<string, Matrix>> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export interface ChartPaletteValidation {
  readonly lightnessWarnings: readonly number[];
  readonly chromaFloorPasses: boolean;
  readonly minimumNormalVisionDeltaE: number;
  readonly minimumColorBlindDeltaE: number;
  readonly minimumContrast: number;
}

/** Applies palette acceptance checks using OKLab distance and simulated colour-vision deficiency. */
export function validateChartPalette(
  colors: readonly string[],
  surfaces: readonly string[],
): ChartPaletteValidation {
  const lab = colors.map((color) => toOklab(color));
  const lightnessWarnings = lab.flatMap(([lightness], index) =>
    lightness < LIGHTNESS_BAND.min || lightness > LIGHTNESS_BAND.max ? [index + 1] : [],
  );
  const chromaFloorPasses = lab.every(([, a, b]) => Math.hypot(a, b) >= CHROMA_FLOOR);
  const adjacentPairs = colors.slice(0, -1).flatMap((color, index) => {
    const next = colors[index + 1];
    return next === undefined ? [] : [[color, next] as const];
  });
  const minimumNormalVisionDeltaE = Math.min(
    ...adjacentPairs.map(([left, right]) => deltaE(toOklab(left), toOklab(right))),
  );
  const minimumColorBlindDeltaE = Math.min(
    ...adjacentPairs.flatMap(([left, right]) =>
      Object.values(COLOR_VISION_MATRICES).map((matrix) =>
        deltaE(toOklab(left, matrix), toOklab(right, matrix)),
      ),
    ),
  );
  const minimumContrast = Math.min(
    ...colors.flatMap((color) => surfaces.map((surface) => contrastRatio(color, surface))),
  );

  return {
    lightnessWarnings,
    chromaFloorPasses,
    minimumNormalVisionDeltaE,
    minimumColorBlindDeltaE,
    minimumContrast,
  };
}

export const CHART_PALETTE_THRESHOLDS = {
  lightnessBand: LIGHTNESS_BAND,
  chromaFloor: CHROMA_FLOOR,
  normalVisionDeltaE: NORMAL_VISION_FLOOR,
  colorBlindDeltaE: COLOR_BLIND_FLOOR,
  contrast: CONTRAST_FLOOR,
} as const;

function toOklab(hex: string, matrix?: Matrix): readonly [number, number, number] {
  if (!/^#[\da-f]{6}$/i.test(hex))
    throw new TypeError(`Expected a six-digit hex colour, received ${hex}`);
  const rgb: Vector = [
    linearize(Number.parseInt(hex.slice(1, 3), 16) / 255),
    linearize(Number.parseInt(hex.slice(3, 5), 16) / 255),
    linearize(Number.parseInt(hex.slice(5, 7), 16) / 255),
  ];
  let simulated: Vector = rgb;
  if (matrix) {
    const [redRow, greenRow, blueRow] = matrix;
    simulated = [
      clamp(redRow[0] * rgb[0] + redRow[1] * rgb[1] + redRow[2] * rgb[2]),
      clamp(greenRow[0] * rgb[0] + greenRow[1] * rgb[1] + greenRow[2] * rgb[2]),
      clamp(blueRow[0] * rgb[0] + blueRow[1] * rgb[1] + blueRow[2] * rgb[2]),
    ];
  }
  const [red, green, blue] = simulated;
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(left: Vector, right: Vector): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) * 100;
}

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
