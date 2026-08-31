/** Reads a File as base64, stripping the `data:...;base64,` prefix the FileReader result URL carries. */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** A `react-easy-crop` crop rectangle, in the source image's own pixels. */
export interface CropArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The platform's profile-image contract: every organization emblem,
 * club emblem, and person profile picture is exactly this size, regardless
 * of source resolution — `identity-media.controller.ts` enforces the same
 * numbers server-side.
 */
export const CROP_OUTPUT_WIDTH = 410;
export const CROP_OUTPUT_HEIGHT = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not load source image')));
    image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** The canvas size needed to hold an image rotated by `rotationDegrees` without clipping a corner. */
export function rotatedBoundingBox(
  width: number,
  height: number,
  rotationDegrees: number,
): { readonly width: number; readonly height: number } {
  const rotated = radians(rotationDegrees);
  return {
    width: Math.abs(Math.cos(rotated) * width) + Math.abs(Math.sin(rotated) * height),
    height: Math.abs(Math.sin(rotated) * width) + Math.abs(Math.cos(rotated) * height),
  };
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  return context;
}

function canvasToBase64Png(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode cropped image'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Unexpected FileReader result'));
          return;
        }
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read cropped blob'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

/**
 * Crops `imageSrc` to `croppedAreaPixels` (react-easy-crop's own output) at
 * `rotationDegrees`, and renders the result to a fixed 410×512 canvas — the
 * crop is scaled to fill that canvas exactly, up or down, regardless of its
 * own resolution (design.md's "always exactly 410×512, source scaled to
 * fit"). Adapted from react-easy-crop's documented rotate-then-crop
 * technique — translate to center, rotate, draw, crop — not hand-rolled
 * from nothing; only the fixed output size is this proposal's own addition.
 */
export async function cropToPng(
  imageSrc: string,
  croppedAreaPixels: CropArea,
  rotationDegrees: number,
): Promise<{ readonly contentBase64: string; readonly contentType: 'image/png' }> {
  const image = await loadImage(imageSrc);
  const bounding = rotatedBoundingBox(image.width, image.height, rotationDegrees);

  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = bounding.width;
  rotatedCanvas.height = bounding.height;
  const rotatedContext = requireContext(rotatedCanvas);
  rotatedContext.translate(bounding.width / 2, bounding.height / 2);
  rotatedContext.rotate(radians(rotationDegrees));
  rotatedContext.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = CROP_OUTPUT_WIDTH;
  outputCanvas.height = CROP_OUTPUT_HEIGHT;
  const outputContext = requireContext(outputCanvas);
  outputContext.drawImage(
    rotatedCanvas,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    CROP_OUTPUT_WIDTH,
    CROP_OUTPUT_HEIGHT,
  );

  const contentBase64 = await canvasToBase64Png(outputCanvas);
  return { contentBase64, contentType: 'image/png' };
}
