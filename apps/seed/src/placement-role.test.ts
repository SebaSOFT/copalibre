import { placementRole } from './placement-role.js';

describe('placementRole', () => {
  it('reads a single place and a range of places', () => {
    expect(placementRole('3º puesto')).toBe('place-3');
    expect(placementRole('7º puesto')).toBe('place-7');
    expect(placementRole('5º al 8º puesto')).toBe('places-5-8');
  });

  it('gives the generated bracket’s own rounds no role', () => {
    for (const label of ['Cuartos de final', 'Semi finales', 'Final', 'Jornada 2']) {
      expect(placementRole(label)).toBeUndefined();
    }
  });
});
