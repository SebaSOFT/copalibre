import {
  DISCIPLINE_BACKGROUND_OPACITY,
  PUBLIC_DISCIPLINE_BACKGROUND_BLUR_PX,
  PUBLIC_DISCIPLINE_BACKGROUND_OPACITY,
  selectDisciplineBackground,
  selectPublicDisciplineBackground,
} from './discipline-background.js';

describe('public discipline background selection', () => {
  it('builds the public URL and exact 10% opacity for one declared image', () => {
    expect(
      selectDisciplineBackground([{ key: 'modules/football/1.1.0/football-01.jpg' }], () => 0.9),
    ).toEqual({
      url: '/objects/discipline-background-image?key=modules%2Ffootball%2F1.1.0%2Ffootball-01.jpg',
      opacity: DISCIPLINE_BACKGROUND_OPACITY,
    });
    expect(DISCIPLINE_BACKGROUND_OPACITY).toBe(0.1);
  });

  it('draws the TV backdrop at 10% with no blur of its own', () => {
    const background = selectDisciplineBackground([{ key: 'k.jpg' }]);
    expect(background?.opacity).toBe(0.1);
    expect(background?.blurPx).toBeUndefined();
  });

  it('draws a public page’s backdrop at 6% and blurred by 8 px', () => {
    const background = selectPublicDisciplineBackground([{ key: 'k.jpg' }]);
    expect(background).toMatchObject({ opacity: 0.06, blurPx: 8 });
    expect(PUBLIC_DISCIPLINE_BACKGROUND_OPACITY).toBe(0.06);
    expect(PUBLIC_DISCIPLINE_BACKGROUND_BLUR_PX).toBe(8);
  });

  it('keeps choosing at random among a public page’s images', () => {
    const images = [{ key: 'a.jpg' }, { key: 'b.jpg' }];
    expect(selectPublicDisciplineBackground(images, () => 0.1)?.url).toContain('a.jpg');
    expect(selectPublicDisciplineBackground(images, () => 0.75)?.url).toContain('b.jpg');
    expect(selectPublicDisciplineBackground(undefined)).toBeUndefined();
  });

  it('uses the injected random selector across multiple images', () => {
    const images = [
      { key: 'modules/football/1.1.0/football-01.jpg' },
      { key: 'modules/football/1.1.0/football-02.jpg' },
    ];
    expect(selectDisciplineBackground(images, () => 0.1)?.url).toContain('football-01.jpg');
    expect(selectDisciplineBackground(images, () => 0.75)?.url).toContain('football-02.jpg');
  });

  it('returns no background when the descriptor declares no images', () => {
    expect(selectDisciplineBackground(undefined)).toBeUndefined();
    expect(selectDisciplineBackground([])).toBeUndefined();
  });
});
