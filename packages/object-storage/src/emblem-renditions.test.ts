import sharp from 'sharp';
import {
  EMBLEM_RENDITION_WIDTHS,
  derivedObjectKeys,
  emblemRenditionKey,
  hasEmblemRenditions,
  isEmblemRenditionWidth,
  renderEmblemRendition,
} from './emblem-renditions.js';

async function transparentEmblem(): Promise<Buffer> {
  return sharp({
    create: { width: 410, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: {
            width: 200,
            height: 200,
            channels: 4,
            background: { r: 220, g: 40, b: 40, alpha: 1 },
          },
        },
        top: 156,
        left: 105,
      },
    ])
    .png()
    .toBuffer();
}

describe('emblem renditions', () => {
  it.each(EMBLEM_RENDITION_WIDTHS)(
    'renders a %i-pixel WebP keeping the aspect ratio and alpha',
    async (width) => {
      const rendition = await renderEmblemRendition(await transparentEmblem(), width);
      const metadata = await sharp(rendition).metadata();

      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(Math.round((width * 512) / 410));
      expect(metadata.hasAlpha).toBe(true);
    },
  );

  it('never enlarges an original smaller than the asked width', async () => {
    const small = await sharp({
      create: {
        width: 40,
        height: 50,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const metadata = await sharp(await renderEmblemRendition(small, 128)).metadata();

    expect(metadata.width).toBe(40);
  });

  it('names a rendition next to its original, stably', () => {
    expect(emblemRenditionKey('org-1/clubs/c-1/a-emblem.png', 128)).toBe(
      'org-1/clubs/c-1/a-emblem.png.w128.webp',
    );
    expect(emblemRenditionKey('k', 64)).toBe(emblemRenditionKey('k', 64));
  });

  it('lists every derived file, the legacy thumbnail included', () => {
    expect(derivedObjectKeys('k')).toEqual([
      'k.w64.webp',
      'k.w128.webp',
      'k.w256.webp',
      'k.thumbnail',
    ]);
  });

  it('makes renditions of raster images only', () => {
    expect(hasEmblemRenditions('image/png')).toBe(true);
    expect(hasEmblemRenditions('image/jpeg')).toBe(true);
    expect(hasEmblemRenditions('image/webp')).toBe(true);
    expect(hasEmblemRenditions('image/avif')).toBe(true);
    expect(hasEmblemRenditions('image/svg+xml')).toBe(false);
    expect(hasEmblemRenditions('image/gif')).toBe(false);
  });

  it('accepts only the listed widths', () => {
    expect(isEmblemRenditionWidth(64)).toBe(true);
    expect(isEmblemRenditionWidth(256)).toBe(true);
    expect(isEmblemRenditionWidth(100)).toBe(false);
    expect(isEmblemRenditionWidth(410)).toBe(false);
  });
});
