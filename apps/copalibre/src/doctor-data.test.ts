import { evaluateDataIntegrity, type DataIntegritySnapshot } from './doctor-data.js';

const EMPTY_SNAPSHOT: DataIntegritySnapshot = { invalidStatusTournaments: [] };

describe('evaluateDataIntegrity', () => {
  it('passes on a clean snapshot', () => {
    const [statusCheck] = evaluateDataIntegrity(EMPTY_SNAPSHOT);
    expect(statusCheck).toEqual({
      name: 'data:tournament-status',
      status: 'pass',
      message: expect.any(String),
    });
  });

  it('reports a non-canonical tournament status, informationally, without failing the check', () => {
    const [statusCheck] = evaluateDataIntegrity({
      invalidStatusTournaments: [
        { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
      ],
    });
    expect(statusCheck.status).toBe('pass');
    expect(statusCheck.message).toContain('Apertura');
    expect(statusCheck.message).toContain("'completed'");
    expect(statusCheck.message).toContain('copalibre doctor --fix');
  });

  it('truncates the sample and adds an ellipsis past 5 invalid tournaments', () => {
    const invalid = Array.from({ length: 7 }, (_, index) => ({
      tournamentId: `t-${index}`,
      organizationId: 'org-1',
      name: `Torneo ${index}`,
      status: 'completed',
    }));
    const [statusCheck] = evaluateDataIntegrity({ invalidStatusTournaments: invalid });
    expect(statusCheck.message).toContain('7 tournament(s)');
    expect(statusCheck.message).toContain('Torneo 4');
    expect(statusCheck.message).not.toContain('Torneo 5');
    expect(statusCheck.message).toContain('…');
  });
});
