import {
  clubEmblemUrl,
  emblemSizes,
  emblemSrcset,
  organizationEmblemUrl,
} from './public-image-paths.js';

describe('emblemSrcset', () => {
  it('lists the three renditions and the original', () => {
    expect(emblemSrcset(clubEmblemUrl('demo', 'club-1'))).toBe(
      [
        '/api/organizations/demo/clubs/club-1/emblem?width=64 64w',
        '/api/organizations/demo/clubs/club-1/emblem?width=128 128w',
        '/api/organizations/demo/clubs/club-1/emblem?width=256 256w',
        '/api/organizations/demo/clubs/club-1/emblem 410w',
      ].join(', '),
    );
  });

  it('keeps a cache-busting query and appends the width to it', () => {
    expect(emblemSrcset(`${organizationEmblemUrl('demo')}?v=obj-1`)).toContain(
      '/api/organizations/demo/emblem?v=obj-1&width=128 128w',
    );
  });

  it('covers tournament emblems and absolute URLs', () => {
    expect(
      emblemSrcset('https://example.test/api/organizations/demo/tournaments/cup/emblem'),
    ).toContain('https://example.test/api/organizations/demo/tournaments/cup/emblem?width=64 64w');
  });

  it.each(['data:image/png;base64,AAAA', 'blob:https://example.test/1', '/crest.png'])(
    'offers no renditions for %s',
    (url) => {
      expect(emblemSrcset(url)).toBeUndefined();
    },
  );
});

describe('emblemSizes', () => {
  it('turns a pixel count into a length', () => {
    expect(emblemSizes(48)).toBe('48px');
  });

  it('passes viewport lengths through', () => {
    expect(emblemSizes('3vmin')).toBe('3vmin');
  });

  it.each(['100%', 'clamp(9vmin, 10vmin, 11vmin)'])('declines %s', (size) => {
    expect(emblemSizes(size)).toBeUndefined();
  });
});
