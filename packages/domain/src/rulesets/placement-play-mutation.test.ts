import { evaluateMutation } from './mutation.js';

describe('placement play structural mutations', () => {
  it.each(['placementPlay', 'zones.zone-a.placementPlay'])(
    'requires rebuilding %s before results and blocks it after results',
    (field) => {
      const generatedFixtures = [
        {
          fixtureId: '0199a000-0000-7000-8000-000000000001',
          stageId: '0199a000-0000-7000-8000-000000000002',
          hasResult: false,
        },
      ];
      expect(
        evaluateMutation({}, field, { hasRecordedResults: false, generatedFixtures }),
      ).toMatchObject({
        ok: true,
        value: { mutationClass: 'requires_rebuild', invalidates: generatedFixtures },
      });
      expect(evaluateMutation({}, field, { hasRecordedResults: true })).toMatchObject({
        ok: false,
      });
    },
  );
});
