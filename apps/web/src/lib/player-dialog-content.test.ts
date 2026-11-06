import {
  buildPlayerDialogContent,
  playerDialogMessage,
  type PlayerDialogLabels,
  type PlayerDialogProfile,
} from './player-dialog-content.js';

const labels: PlayerDialogLabels = {
  fallbackTitle: 'Player',
  loadingPlaceholder: 'Loading details',
  loadingFetch: 'Loading',
  careerStatisticsHeading: 'Career',
  competitionHistoryHeading: 'History',
  columnTournament: 'Tournament',
  columnTeam: 'Team',
  columnRole: 'Role',
  noCareerStatistics: 'No statistics',
  noCompetitionHistory: 'No history',
  loadError: 'Failed',
};

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  "' onmouseover='alert(1)",
  '</td></tr></table><iframe src=javascript:alert(1)></iframe>',
  '&lt;b&gt;encoded&lt;/b&gt;',
];

function build(profile: PlayerDialogProfile): HTMLElement {
  return buildPlayerDialogContent(document, profile, labels);
}

describe('the player dialog content', () => {
  it.each(PAYLOADS)('keeps %s as text in every field', (payload) => {
    const content = build({
      nationality: payload,
      careerStatistics: [{ statistics: [{ label: payload, value: 3 }] }],
      competitionHistory: [
        {
          tournamentName: payload,
          teamName: payload,
          role: payload,
          entrantAbbreviation: payload,
        },
      ],
    });

    expect(content.querySelector('img, script, svg, iframe, b')).toBeNull();
    expect(content.querySelector('.cl-player-profile__tag')?.textContent).toBe(payload);
    expect(content.querySelector('.cl-stat-label')?.textContent).toBe(payload);
    const cells = [...content.querySelectorAll('tbody td')].map((cell) => cell.textContent);
    expect(cells).toEqual([payload, `${payload} (${payload})`, payload]);
    expect(content.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('keeps the sections and classes of an ordinary profile', () => {
    const content = build({
      nationality: 'AR',
      age: 28,
      careerStatistics: [
        { statistics: [{ label: 'Goals', value: 7 }] },
        { statistics: [{ label: 'Assists', value: 2 }] },
        {},
      ],
      competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa de Italia', role: 'player' }],
    });

    expect(content.className).toBe('cl-modal-profile');
    expect(
      [...content.querySelectorAll('.cl-player-profile__tag')].map((tag) => tag.textContent),
    ).toEqual(['AR', 'Age: 28']);
    expect(
      [...content.querySelectorAll('.cl-modal-section-title')].map((title) => title.textContent),
    ).toEqual(['Career', 'History']);
    expect(content.querySelectorAll('.cl-modal-stats-grid .cl-stat-item')).toHaveLength(2);
    expect(content.querySelector('.cl-stat-val')?.textContent).toBe('7');
    // These sit inline, so the space between them is what keeps them apart.
    expect(content.querySelector('.cl-modal-meta')?.textContent).toBe('AR Age: 28');
    expect(content.querySelector('.cl-stat-item')?.textContent).toBe('Goals 7');
    expect([...content.querySelectorAll('th')].map((header) => header.textContent)).toEqual([
      'Tournament',
      'Team',
      'Role',
    ]);
    expect(content.querySelector('.cl-modal-history-table td strong')?.textContent).toBe('Copa');
    expect(content.querySelectorAll('tbody td')[1]?.textContent).toBe('Casa de Italia');
  });

  it('states an absence and leaves out empty metadata', () => {
    const content = build({});

    expect(content.querySelector('.cl-modal-meta')).toBeNull();
    expect(content.querySelector('table')).toBeNull();
    expect(
      [...content.querySelectorAll('.cl-modal-empty')].map((empty) => empty.textContent),
    ).toEqual(['No statistics', 'No history']);
  });

  it('shows an age of zero and an empty role without inventing text', () => {
    const content = build({
      age: 0,
      competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa de Italia' }],
    });

    expect(content.querySelector('.cl-player-profile__tag')?.textContent).toBe('Age: 0');
    expect(content.querySelectorAll('tbody td')[2]?.textContent).toBe('');
  });

  it('writes a status message as text', () => {
    const message = playerDialogMessage(document, 'cl-inline-alert', '<b>Failed</b>');

    expect(message.className).toBe('cl-inline-alert');
    expect(message.querySelector('b')).toBeNull();
    expect(message.textContent).toBe('<b>Failed</b>');
  });
});
