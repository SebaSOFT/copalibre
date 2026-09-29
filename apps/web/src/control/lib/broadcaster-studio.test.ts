import { buildOverlayUrl, OBS_RESOLUTION_PRESETS } from './broadcaster-studio.js';

describe('buildOverlayUrl (openspec 0300)', () => {
  const issuedUrl = 'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=abc';

  it('appends the mode and preserves the existing token param', () => {
    const url = buildOverlayUrl(issuedUrl, 'overlay-lower', 'transparent');
    expect(url).toBe(
      'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=abc&mode=overlay-lower',
    );
  });

  it('adds a chroma param as a bare hex value for each named chroma', () => {
    expect(
      new URL(buildOverlayUrl(issuedUrl, 'overlay-full', 'green')).searchParams.get('chroma'),
    ).toBe('00FF00');
    expect(
      new URL(buildOverlayUrl(issuedUrl, 'overlay-full', 'magenta')).searchParams.get('chroma'),
    ).toBe('FF00FF');
    expect(
      new URL(buildOverlayUrl(issuedUrl, 'overlay-full', 'dark')).searchParams.get('chroma'),
    ).toBe('0B0F1A');
  });

  it('sends no chroma param at all for transparent', () => {
    expect(
      new URL(buildOverlayUrl(issuedUrl, 'overlay-lower', 'transparent')).searchParams.has(
        'chroma',
      ),
    ).toBe(false);
  });

  it('replaces mode/chroma on a URL that already carries one, rather than duplicating them', () => {
    const alreadyLower = buildOverlayUrl(issuedUrl, 'overlay-lower', 'green');
    const switched = buildOverlayUrl(alreadyLower, 'overlay-full', 'magenta');
    const params = new URL(switched).searchParams;
    expect(params.getAll('mode')).toEqual(['overlay-full']);
    expect(params.getAll('chroma')).toEqual(['FF00FF']);
    expect(params.get('token')).toBe('abc');
  });
});

describe('OBS_RESOLUTION_PRESETS (openspec 0300)', () => {
  it('lists 1080p, 720p, and a 9:16 vertical preset, each at 60 FPS', () => {
    expect(OBS_RESOLUTION_PRESETS).toEqual([
      { id: '1080p', width: 1920, height: 1080, fps: 60 },
      { id: '720p', width: 1280, height: 720, fps: 60 },
      { id: 'vertical', width: 1080, height: 1920, fps: 60 },
    ]);
  });
});
