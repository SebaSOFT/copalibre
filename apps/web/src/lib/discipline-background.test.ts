import {
  DISCIPLINE_BACKGROUND_OPACITY,
  selectDisciplineBackground,
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
