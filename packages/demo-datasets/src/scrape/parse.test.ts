import { fixture } from './fixture.js';
import { normaliseRound, parseCalendar } from './parse-calendar.js';
import { parseReport } from './parse-report.js';
import { parseRoster } from './parse-roster.js';
import { parseTeams } from './parse-teams.js';

describe('parseTeams', () => {
  it('reads one league team list and ignores the others', () => {
    expect(parseTeams(fixture('list.html'), '273').map((team) => team.abbreviation)).toEqual([
      'LOM',
      'HUR',
      'RED',
      'BOG',
      'UDB',
      'AND',
    ]);
    expect(parseTeams(fixture('list.html'), '273')[0]).toEqual({
      teamId: '1047',
      logoFile: '113.png',
      abbreviation: 'LOM',
      name: 'LOMAS DE RIVADAVIA',
    });
  });

  it('fails clearly for an unknown league', () => {
    expect(() => parseTeams(fixture('list.html'), '999')).toThrow('no team list');
  });
});

describe('parseCalendar', () => {
  const games = parseCalendar(fixture('calendar.html'));

  it('reads games in document order with phase and round', () => {
    expect(games.map((game) => [game.gameId, game.phaseName, game.round])).toEqual([
      ['2727', 'Copa Oro', '3º puesto'],
      ['2672', 'Grupo A', 'Jornada 1'],
      ['2690', 'Grupo B', 'Jornada 2'],
    ]);
  });

  it('reads teams, venue, time and score', () => {
    expect(games[0]).toMatchObject({
      phaseId: '285',
      date: '08/11/2025',
      time: '13:45',
      venue: 'Aldo Cantoni',
      homeLogoFile: '113.png',
      homeName: 'LOMAS DE RIVADAVIA',
      awayLogoFile: '143.png',
      awayName: 'HURACAN',
      homeGoals: 5,
      awayGoals: 4,
      note: undefined,
    });
  });

  it('attaches the portal note that follows a game', () => {
    expect(games[1]?.note).toBe('RESULTADO PARTIDO 10-2 REGLAMENTO 8-2');
    expect(games[1]).toMatchObject({ homeGoals: 8, awayGoals: 2 });
  });

  it('leaves the score undefined for an unplayed game', () => {
    expect(games[2]).toMatchObject({
      homeGoals: undefined,
      awayGoals: undefined,
      venue: 'D. U. Estudiantil',
    });
  });

  it('normalises the portal round labels', () => {
    expect(normaliseRound('Giornata Jornada 3 - 04/11/2025')).toBe('Jornada 3');
    expect(normaliseRound('2º JORNADA')).toBe('Jornada 2');
    expect(normaliseRound('SEMI FINALES')).toBe('Semi finales');
    expect(normaliseRound('5º AL 8º PUESTO')).toBe('5º al 8º puesto');
  });
});

describe('parseRoster', () => {
  const players = parseRoster(fixture('roster.html'));

  it('reads players with team, nationality and totals, and skips staff', () => {
    expect(players).toEqual([
      {
        playerId: '9001',
        teamId: '1047',
        fullName: 'PEREYRA TEST , MARTIN',
        nationality: 'AR',
        goals: 3,
        assists: 1,
      },
      {
        playerId: '9002',
        teamId: '1047',
        fullName: 'LOZANO TEST , IVAN',
        nationality: 'ES',
        goals: 0,
        assists: 0,
      },
      {
        playerId: '9003',
        teamId: '1029',
        fullName: 'VERA TEST , JOAQUIN NICOLAS',
        nationality: 'CL',
        goals: 7,
        assists: 2,
      },
    ]);
  });
});

describe('parseReport', () => {
  const report = parseReport(fixture('report.html'));

  it('reads the score, the round and the referees', () => {
    expect(report).toMatchObject({ homeGoals: 5, awayGoals: 4, roundNumber: 2 });
    expect(report.referees).toEqual([
      { surname: 'REFEREE TEST', givenNames: 'ANA MARIA' },
      { surname: 'JUEZ TEST', givenNames: 'LUIS' },
      { surname: 'OTRO', givenNames: 'TEST SOFIA' },
      { surname: 'AUXILIAR', givenNames: 'TEST' },
    ]);
  });

  it('reads goals with period, clock, scorer and detail', () => {
    expect(report.goals).toEqual([
      {
        period: 'P2',
        clock: '00:12',
        teamLogoFile: '113.png',
        playerId: '9001',
        scorerName: { surname: 'PEREYRA TEST', givenNames: 'MARTIN' },
        teamId: '1047',
        detail: '',
      },
      expect.objectContaining({ clock: '00:32', detail: 'falta directa' }),
    ]);
  });

  it('reads both lineups with dorsal, goalkeeper and captain marks', () => {
    expect(report.homeSheet).toEqual([
      {
        dorsal: 10,
        goalkeeper: true,
        captain: false,
        name: { surname: 'LOZANO TEST', givenNames: 'IVAN' },
        goals: 0,
        assists: 0,
      },
      {
        dorsal: 5,
        goalkeeper: false,
        captain: true,
        name: { surname: 'PEREYRA TEST', givenNames: 'MARTIN' },
        goals: 2,
        assists: 1,
      },
    ]);
    expect(report.awaySheet).toHaveLength(1);
  });

  it('copes with a report that has no sheet', () => {
    expect(parseReport('<div id="div_ficha_resumen"></div>')).toEqual({
      homeGoals: 0,
      awayGoals: 0,
      roundNumber: undefined,
      referees: [],
      goals: [],
      homeSheet: [],
      awaySheet: [],
    });
  });
});

describe('defensive parsing', () => {
  it('tolerates calendar rows with missing attributes and stray notes', () => {
    const html = `
      <tr class="team_class"><td colspan="18">NOTE BEFORE ANY GAME</td></tr>
      <table><tr class="team_class"><td></td><td>x</td><td>y</td><td></td>
        <td><i class="game_report"></i></td></tr></table>`;
    const [game] = parseCalendar(html);
    expect(parseCalendar(html)).toHaveLength(1);
    expect(game).toMatchObject({
      gameId: '',
      phaseId: '',
      homeLogoFile: '',
      homeName: '',
      homeGoals: undefined,
    });
  });

  it('tolerates roster rows with no flag, odd totals and no team', () => {
    const html = `<table><tr class="fila_stats_player"><td></td><td></td><td></td><td></td>
      <td><a id_player="1">X</a></td><td>n/a</td><td></td><td></td><td></td></tr></table>`;
    expect(parseRoster(html)).toEqual([
      { playerId: '1', teamId: '', fullName: '', nationality: undefined, goals: 0, assists: 0 },
    ]);
  });

  it('tolerates goal rows with missing pieces and short sheet rows', () => {
    const html = `<div id="div_ficha_resumen"><table><tr><td><img src="/icon_gol.png"></td></tr></table></div>
      <div id="div_acta"><table class="tabla_acta_print"><tr><td>Nº</td></tr>
        <tr><td>7</td><td></td><td></td><td></td><td>ONLY,NAME</td></tr>
        <tr><td>8</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>9</td><td></td><td></td><td></td><td>NO,DORSAL</td><td>x</td><td>y</td></tr></table></div>`;
    const report = parseReport(html);
    expect(report.goals).toEqual([
      expect.objectContaining({ playerId: '', teamId: '', teamLogoFile: '', detail: '' }),
    ]);
    expect(report.homeSheet).toEqual([
      expect.objectContaining({
        dorsal: 9,
        name: { surname: 'NO', givenNames: 'DORSAL' },
        goals: 0,
      }),
    ]);
  });
});
