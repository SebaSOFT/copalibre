import { jest } from '@jest/globals';
import {
  CROP_OUTPUT_HEIGHT,
  CROP_OUTPUT_WIDTH,
  cropToPng,
  readAsBase64,
  rotatedBoundingBox,
  type CropArea,
} from './image-upload.js';

describe('readAsBase64', () => {
  it('resolves with the base64 payload, stripped of the data-URL prefix', async () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    const result = await readAsBase64(file);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('data:');
  });

  it('rejects when the FileReader itself errors', async () => {
    const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function readAsDataURL(this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as never);
    };
    try {
      const file = new File(['hello'], 'photo.png', { type: 'image/png' });
      await expect(readAsBase64(file)).rejects.toThrow('Could not read file');
    } finally {
      FileReader.prototype.readAsDataURL = originalReadAsDataURL;
    }
  });
});

describe('rotatedBoundingBox', () => {
  it('leaves the box unchanged at 0 degrees', () => {
    expect(rotatedBoundingBox(100, 200, 0)).toEqual({ width: 100, height: 200 });
  });

  it('swaps width and height at 90 degrees', () => {
    const box = rotatedBoundingBox(100, 200, 90);
    expect(box.width).toBeCloseTo(200);
    expect(box.height).toBeCloseTo(100);
  });
});

describe('cropToPng', () => {
  interface TrackedContext {
    readonly translate: jest.Mock;
    readonly rotate: jest.Mock;
    readonly drawImage: jest.Mock;
    readonly clearRect: jest.Mock;
  }

  function trackedContext(order: string[]): TrackedContext {
    return {
      translate: jest.fn(() => order.push('translate')),
      rotate: jest.fn(() => order.push('rotate')),
      drawImage: jest.fn((...args: unknown[]) => order.push(`drawImage:${args.length}`)),
      clearRect: jest.fn(() => order.push('clearRect')),
    };
  }

  function spyOnCanvases(order: string[]): {
    canvases: HTMLCanvasElement[];
    restore: () => void;
  } {
    const canvases: HTMLCanvasElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === 'canvas') canvases.push(element as HTMLCanvasElement);
        return element;
      });

    let callIndex = 0;
    const contexts = [trackedContext(order), trackedContext(order)];
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => contexts[callIndex++] as unknown as CanvasRenderingContext2D);

    return {
      canvases,
      restore: () => {
        createElementSpy.mockRestore();
        getContextSpy.mockRestore();
      },
    };
  }

  it('always outputs exactly 410×512 for a crop area larger than the output (downscale)', async () => {
    const order: string[] = [];
    const { canvases, restore } = spyOnCanvases(order);
    try {
      const largeCrop: CropArea = { x: 0, y: 0, width: 2000, height: 2500 };
      await cropToPng('blob:source', largeCrop, 0);

      const outputCanvas = canvases[1];
      expect(outputCanvas.width).toBe(CROP_OUTPUT_WIDTH);
      expect(outputCanvas.height).toBe(CROP_OUTPUT_HEIGHT);
    } finally {
      restore();
    }
  });

  it('always outputs exactly 410×512 for a crop area smaller than the output (upscale)', async () => {
    const order: string[] = [];
    const { canvases, restore } = spyOnCanvases(order);
    try {
      const smallCrop: CropArea = { x: 0, y: 0, width: 50, height: 62 };
      await cropToPng('blob:source', smallCrop, 0);

      const outputCanvas = canvases[1];
      expect(outputCanvas.width).toBe(CROP_OUTPUT_WIDTH);
      expect(outputCanvas.height).toBe(CROP_OUTPUT_HEIGHT);
    } finally {
      restore();
    }
  });

  it('rotates the source onto an intermediate canvas before cropping it onto the output canvas', async () => {
    const order: string[] = [];
    const { restore } = spyOnCanvases(order);
    try {
      const crop: CropArea = { x: 10, y: 10, width: 400, height: 500 };
      await cropToPng('blob:source', crop, 45);

      // The 3-arg `drawImage` paints the whole (rotated) source image onto the
      // intermediate canvas; the 9-arg call is the final crop-and-scale onto
      // the fixed-size output canvas. Rotation (`translate`+`rotate`) must
      // happen before that first draw, not between the two draws.
      expect(order).toEqual(['translate', 'rotate', 'drawImage:3', 'drawImage:9']);
    } finally {
      restore();
    }
  });

  it('produces base64 PNG content regardless of rotation', async () => {
    const order: string[] = [];
    const { restore } = spyOnCanvases(order);
    try {
      const crop: CropArea = { x: 0, y: 0, width: 300, height: 375 };
      const output = await cropToPng('blob:source', crop, 90);

      expect(output.contentType).toBe('image/png');
      expect(output.contentBase64.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('rejects when the canvas cannot produce a 2D context', async () => {
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    try {
      const crop: CropArea = { x: 0, y: 0, width: 300, height: 375 };
      await expect(cropToPng('blob:source', crop, 0)).rejects.toThrow(
        'Canvas 2D context unavailable',
      );
    } finally {
      getContextSpy.mockRestore();
    }
  });

  it('rejects when the canvas cannot encode a blob', async () => {
    const order: string[] = [];
    const { restore } = spyOnCanvases(order);
    const toBlobSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback: BlobCallback) => callback(null));
    try {
      const crop: CropArea = { x: 0, y: 0, width: 300, height: 375 };
      await expect(cropToPng('blob:source', crop, 0)).rejects.toThrow(
        'Could not encode cropped image',
      );
    } finally {
      toBlobSpy.mockRestore();
      restore();
    }
  });
});
