import { ICON_REGISTRY, isIconName } from './icon-registry.js';
import { completionFigureLabels, publicIntl, resultStateLabels } from './i18n/public-intl.js';
import { presentState, resultLegend, resultStateIcon, type ResultState } from './result-state.js';

const intl = publicIntl('es');
const labels = resultStateLabels(intl);

describe('result state shapes', () => {
  it('gives every state its own registry icon, never a character', () => {
    const legend = resultLegend(labels);
    const icons = legend.map((state) => state.icon);
    expect(new Set(icons).size).toBe(legend.length);
    for (const icon of icons) expect(isIconName(icon)).toBe(true);
    for (const state of legend) {
      expect(resultStateIcon(state.state)).toBe(state.icon);
      expect(presentState(state.state, labels).label).toBe(labels[state.state]);
    }
  });

  it('draws the winner and the loser as one triangle, filled and turned', () => {
    const winner = ICON_REGISTRY[resultStateIcon('winner' satisfies ResultState)];
    const loser = ICON_REGISTRY[resultStateIcon('loser' satisfies ResultState)];
    expect(winner.name).toBe(loser.name);
    expect('fill' in winner && winner.fill).toBe(true);
    expect('flip' in loser && loser.flip).toBe(true);
  });

  it('gives the completion figure a distinct registry icon per state', () => {
    const icons = [
      completionFigureLabels(intl, { totalMatches: 0, resolvedMatches: 0 }).stateIcon,
      completionFigureLabels(intl, { totalMatches: 4, resolvedMatches: 2 }).stateIcon,
      completionFigureLabels(intl, { totalMatches: 4, resolvedMatches: 4 }).stateIcon,
    ];
    expect(icons).toEqual(['minus', 'start-clock', 'check']);
    for (const icon of icons) expect(isIconName(icon)).toBe(true);
  });
});
