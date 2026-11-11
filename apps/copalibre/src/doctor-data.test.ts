import { evaluateDataIntegrity, type DataIntegritySnapshot } from './doctor-data.js';

const EMPTY_SNAPSHOT: DataIntegritySnapshot = {
  invalidStatusTournaments: [],
  reservedAliasOrganizations: [],
};

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
      ...EMPTY_SNAPSHOT,
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
    const [statusCheck] = evaluateDataIntegrity({
      ...EMPTY_SNAPSHOT,
      invalidStatusTournaments: invalid,
    });
    expect(statusCheck.message).toContain('7 tournament(s)');
    expect(statusCheck.message).toContain('Torneo 4');
    expect(statusCheck.message).not.toContain('Torneo 5');
    expect(statusCheck.message).toContain('…');
  });

  it('passes the reserved alias check when no organization holds one', () => {
    const [, aliasCheck] = evaluateDataIntegrity(EMPTY_SNAPSHOT);
    expect(aliasCheck).toEqual({
      name: 'data:reserved-organization-alias',
      status: 'pass',
      message: 'No organization holds a reserved alias',
    });
  });

  it('warns and names an organization that holds a reserved alias', () => {
    const [, aliasCheck] = evaluateDataIntegrity({
      ...EMPTY_SNAPSHOT,
      reservedAliasOrganizations: [
        { organizationId: 'org-1', alias: 'platform', name: 'Plataforma Deportiva' },
      ],
    });
    expect(aliasCheck.name).toBe('data:reserved-organization-alias');
    expect(aliasCheck.status).toBe('warn');
    expect(aliasCheck.message).toContain("Plataforma Deportiva ('platform')");
    expect(aliasCheck.message).toContain('1 organization(s)');
  });
});
