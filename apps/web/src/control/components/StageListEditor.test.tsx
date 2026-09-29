import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
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

  it('updates preview structure when format is changed', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      withIntl(
        <StageListEditor
          formats={formats}
          onChange={onChange}
          showStructurePreview
          stages={singleStage}
        />,
      ),
    );

    // Initial single elimination for 8 entrants: SE-R1-M1..M4, SE-R2-M1..M2, SE-R3-M1
    expect(screen.getByText('SE-R3-M1')).toBeDefined();

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

    // Double elimination has LB matches (e.g. LB-R1-M1)
    expect(screen.getByText('LB-R1-M1')).toBeDefined();
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
