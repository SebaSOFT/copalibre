import { footballDescriptor } from '../modules/football-descriptor.js';
import { validateDisciplineDescriptorDocument } from './descriptor-schema.js';

describe('discipline descriptor live-match effects', () => {
  it('accepts a timed penalty that a discipline explicitly permits an official to resolve', () => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        {
          code: 'sin-bin',
          label: 'Sin bin',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'person',
          payloadSchema: { type: 'object' },
          effects: [
            {
              kind: 'timed-penalty',
              durationSeconds: 120,
              affects: 'actor',
              allowManualResolution: true,
            },
          ],
        },
      ],
    });

    expect(validateDisciplineDescriptorDocument(descriptor).ok).toBe(true);
  });

  it('accepts a descriptor-owned outcome branch only when it names final declared events', () => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        {
          code: 'penalty-decision',
          label: 'Penalty decision',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          workflow: {
            kind: 'outcome-choice',
            options: [
              { definitionCode: 'penalty-goal', label: 'Gol' },
              { definitionCode: 'penalty-missed', label: 'Fallado' },
            ],
          },
        },
        {
          code: 'penalty-goal',
          label: 'Penalty goal',
          category: 'positive',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object', properties: { description: { type: 'string' } } },
          effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
        },
        {
          code: 'penalty-missed',
          label: 'Penalty missed',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
        },
      ],
    });

    expect(validateDisciplineDescriptorDocument(descriptor).ok).toBe(true);

    const firstDefinition = descriptor.eventDefinitions[0];
    if (!firstDefinition) throw new Error('fixture has no preliminary event definition');
    const invalid = footballDescriptor({
      eventDefinitions: [
        {
          ...firstDefinition,
          workflow: {
            kind: 'outcome-choice',
            options: [{ definitionCode: 'missing', label: 'Missing' }],
          },
        },
      ],
    });
    expect(validateDisciplineDescriptorDocument(invalid).ok).toBe(false);
  });
});
