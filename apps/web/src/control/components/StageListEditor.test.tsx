import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { StageListEditor } from './StageListEditor.js';
import { withIntl } from '../i18n/test-support.js';
import type { WizardStageDraft } from '../lib/stage-authoring.js';

describe('StageListEditor', () => {
  const formats = ['single-elimination', 'double-elimination', 'round-robin'];
  const singleStage: readonly WizardStageDraft[] = [
    { number: 1, name: 'Main Bracket', format: 'single-elimination' },
  ];
  const multiStages: readonly WizardStageDraft[] = [
    { number: 1, name: 'Group Stage', format: 'round-robin' },
    { number: 2, name: 'Playoffs', format: 'single-elimination' },
  ];

  it('renders structure preview panel for the first stage when showStructurePreview is true', () => {
    render(
      withIntl(<StageListEditor formats={formats} showStructurePreview stages={singleStage} />),
    );

    expect(screen.getByTestId('stage-structure-preview')).toBeDefined();
    expect(screen.getByText('Structure preview')).toBeDefined();
    expect(screen.getByTestId('wizard-preview-demonstration')).toBeDefined();
    expect(screen.getByText('Illustrative preview (8 entrants)')).toBeDefined();
  });

  it('omits illustrative label and displays declared capacity when capacity is set', () => {
    render(
      withIntl(
        <StageListEditor
          capacity={16}
          formats={formats}
          showStructurePreview
          stages={singleStage}
        />,
      ),
    );

    expect(screen.getByTestId('stage-structure-preview')).toBeDefined();
    expect(screen.queryByTestId('wizard-preview-demonstration')).toBeNull();
    expect(screen.getByTestId('wizard-preview-capacity')).toBeDefined();
    expect(screen.getByText('16 entrants')).toBeDefined();
  });

  it('shows no structure preview panel for stages after the first stage', () => {
    render(
      withIntl(<StageListEditor formats={formats} showStructurePreview stages={multiStages} />),
    );

    const previews = screen.getAllByTestId('stage-structure-preview');
    expect(previews).toHaveLength(1);
    expect(screen.getByText('Stage 1')).toBeDefined();
    expect(screen.getByText('Stage 2')).toBeDefined();
  });

  it('shows a translated label for a supported stage format', () => {
    render(withIntl(<StageListEditor formats={formats} stages={singleStage} />));

    expect(screen.getByRole('combobox', { name: 'Stage format' }).textContent).toContain(
      'Single elimination',
    );
  });

  it('updates preview structure when format is changed', () => {
    const onChange = jest.fn();
    const { container, rerender } = render(
      withIntl(
        <StageListEditor
          formats={formats}
          onChange={onChange}
          showStructurePreview
          stages={singleStage}
        />,
      ),
    );

    // The preview communicates bracket shape without exposing generated match IDs.
    expect(container.querySelectorAll('.cl-bracket-node__title-skeleton').length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('.cl-bracket-slot-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText(/SE-R/)).toBeNull();

    // Rerender with double-elimination
    rerender(
      withIntl(
        <StageListEditor
          formats={formats}
          onChange={onChange}
          showStructurePreview
          stages={[{ number: 1, name: 'Main Bracket', format: 'double-elimination' }]}
        />,
      ),
    );

    // The double-elimination skeleton includes both bracket branches and final states.
    expect(container.querySelectorAll('.cl-bracket-node__title-skeleton').length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('.cl-bracket-slot-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText(/LB-R/)).toBeNull();
    expect(screen.getByText('Conditional reset final')).toBeDefined();
  });

  it('renders explicit group cards using the configured count and manual capacities', () => {
    render(
      withIntl(
        <StageListEditor
          capacity={18}
          formats={formats}
          showStructurePreview
          stages={[
            {
              number: 1,
              name: 'Groups',
              format: 'round-robin',
              groupConfiguration: {
                groupCount: 4,
                groupSize: 5,
                distribution: 'manual',
                manualGroupSizes: [4, 5, 5, 4],
              },
            },
          ]}
        />,
      ),
    );

    expect(screen.getByText('Group A')).toBeDefined();
    expect(screen.getByText('Group D')).toBeDefined();
    expect(screen.getAllByLabelText(/Group [1-4] capacity/)).toHaveLength(4);
    expect(screen.queryByText('Matchday 1')).toBeNull();
  });

  it('edits manual group capacities and clears them when switching distribution policy', () => {
    const onChange = jest.fn();
    const stage: readonly WizardStageDraft[] = [
      {
        number: 1,
        name: 'Groups',
        format: 'round-robin',
        groupConfiguration: {
          groupCount: 3,
          groupSize: 4,
          distribution: 'manual',
          manualGroupSizes: [3, 4, 5],
        },
      },
    ];
    render(withIntl(<StageListEditor formats={formats} onChange={onChange} stages={stage} />));

    fireEvent.change(screen.getByLabelText('Number of groups'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        groupConfiguration: {
          groupCount: 4,
          groupSize: 4,
          distribution: 'manual',
          manualGroupSizes: [3, 4, 5, 4],
        },
      }),
    ]);

    fireEvent.change(screen.getByLabelText('Nominal group size'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        groupConfiguration: expect.objectContaining({ groupSize: 6 }),
      }),
    ]);

    fireEvent.change(screen.getByLabelText('Entrant distribution'), {
      target: { value: 'balanced' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        groupConfiguration: {
          groupCount: 3,
          groupSize: 4,
          distribution: 'balanced',
        },
      }),
    ]);
  });

  it('offers both attribute-key allocation controls and free-form fallback', () => {
    const onChange = jest.fn();
    const weightedStage: readonly WizardStageDraft[] = [
      {
        number: 1,
        name: 'Playoffs',
        format: 'single-elimination',
        allocation: { mode: 'weighted', direction: 'higher-first' },
      },
    ];

    const { rerender } = render(
      withIntl(
        <StageListEditor
          attributeKeys={['ranking', 'rating']}
          formats={formats}
          onChange={onChange}
          showAllocation
          stages={weightedStage}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText('Attribute'), {
      target: { value: 'rating' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        allocation: { mode: 'weighted', direction: 'higher-first', attributeKey: 'rating' },
      }),
    ]);
    fireEvent.change(screen.getByLabelText('Direction'), {
      target: { value: 'lower-first' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ allocation: { mode: 'weighted', direction: 'lower-first' } }),
    ]);

    rerender(
      withIntl(
        <StageListEditor
          formats={formats}
          onChange={onChange}
          showAllocation
          stages={weightedStage}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText('Attribute'), {
      target: { value: 'rating' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        allocation: { mode: 'weighted', direction: 'higher-first', attributeKey: 'rating' },
      }),
    ]);
  });

  describe('zones (0339)', () => {
    const zoned: readonly WizardStageDraft[] = [
      {
        number: 1,
        name: 'Copas',
        format: 'single-elimination',
        zones: [{ name: 'Copa Oro' }, { name: 'Liga', format: 'round-robin' }],
      },
    ];

    it('shows no zone section unless showZones is set', () => {
      render(withIntl(<StageListEditor formats={formats} stages={zoned} />));

      expect(screen.queryByText(/^Zones \(/)).toBeNull();
      expect(screen.queryByLabelText('Zone name')).toBeNull();
    });

    it('lists each zone with its name and format, inheriting by default', () => {
      render(withIntl(<StageListEditor formats={formats} showZones stages={zoned} />));

      expect(screen.getByText('Zones (2)')).toBeDefined();
      const names = screen.getAllByLabelText('Zone name') as HTMLInputElement[];
      expect(names.map((input) => input.value)).toEqual(['Copa Oro', 'Liga']);
      const zoneFormats = screen.getAllByRole('combobox', { name: 'Zone format' });
      expect((zoneFormats[0] as HTMLSelectElement).value).toBe('__inherit__');
      expect((zoneFormats[1] as HTMLSelectElement).value).toBe('round-robin');
      expect(zoneFormats[0]?.textContent).toContain('Same as the stage (Single elimination)');
    });

    it('adds, renames and removes zones', () => {
      const onChange = jest.fn();
      render(
        withIntl(
          <StageListEditor formats={formats} onChange={onChange} showZones stages={zoned} />,
        ),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Add zone' }));
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          zones: [{ name: 'Copa Oro' }, { name: 'Liga', format: 'round-robin' }, { name: '' }],
        }),
      ]);

      fireEvent.change(screen.getAllByLabelText('Zone name')[0] as HTMLElement, {
        target: { value: 'Copa de Oro' },
      });
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          zones: [{ name: 'Copa de Oro' }, { name: 'Liga', format: 'round-robin' }],
        }),
      ]);

      fireEvent.click(screen.getAllByRole('button', { name: 'Remove zone' })[1] as HTMLElement);
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ zones: [{ name: 'Copa Oro' }] }),
      ]);
    });

    it('offers a zone series only where the editor declares series', () => {
      const { rerender } = render(
        withIntl(<StageListEditor formats={formats} showZones stages={zoned} />),
      );
      expect(screen.queryByLabelText('Settle this zone’s crosses with a series')).toBeNull();

      rerender(withIntl(<StageListEditor formats={formats} showSeries showZones stages={zoned} />));
      expect(screen.getAllByLabelText('Settle this zone’s crosses with a series')).toHaveLength(2);
    });
  });

  it('does not render structure preview when showStructurePreview is false', () => {
    render(
      withIntl(
        <StageListEditor formats={formats} showStructurePreview={false} stages={singleStage} />,
      ),
    );

    expect(screen.queryByTestId('stage-structure-preview')).toBeNull();
  });
});
