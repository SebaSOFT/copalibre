import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '../../i18n/test-support.js';
import type { PromotionPreviewResponse, ZoneResponse } from '../../lib/api-client.js';
import { PromotionPlanTemplate } from './PromotionPlanTemplate.js';

const zoneWithPlan = {
  stageNumber: 1,
  number: 1,
  name: 'Zona Campeonato',
  planConfigured: true,
  groups: [],
  promotionPlan: {
    nextStageNumber: 2,
    rules: {
      perGroupAdvance: 1,
      bands: [
        { zoneRef: 'gold', count: 2 },
        { zoneRef: 'silver', count: 1 },
      ],
    },
  },
} as unknown as ZoneResponse;

const preview: PromotionPreviewResponse = {
  combined: [
    { entrantId: 'a', groupId: 'g1', rank: 1 },
    { entrantId: 'b', groupId: 'g2', rank: 2 },
    { entrantId: 'c', groupId: 'g1', rank: 3 },
  ],
  bands: {
    gold: [
      { entrantId: 'a', groupId: 'g1', rank: 1 },
      { entrantId: 'b', groupId: 'g2', rank: 2 },
    ],
    silver: [{ entrantId: 'c', groupId: 'g1', rank: 3 }],
  },
  trace: [],
};

function renderTemplate(
  props: Partial<React.ComponentProps<typeof PromotionPlanTemplate>> = {},
): jest.Mock {
  const onSave = jest.fn(() => Promise.resolve());
  render(
    withIntl(
      <PromotionPlanTemplate
        entrantLabel={(id) => `Entrant ${id}`}
        onSave={onSave}
        preview={undefined}
        previewError={undefined}
        tournamentAlias="apertura-2026"
        zone={zoneWithPlan}
        zoneNumber={1}
        {...props}
      />,
    ),
  );
  return onSave;
}

describe('PromotionPlanTemplate', () => {
  it('stays clean for a saved plan, and totals the slots of its bands', () => {
    renderTemplate();

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('slots across bands').closest('p')?.textContent).toBe(
      '3slots across bands',
    );
  });

  it('names each changed part in the unsaved bar, and Reset restores the saved plan', () => {
    renderTemplate();

    fireEvent.change(screen.getByLabelText('Entrants advancing per group'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove band' })[0] as HTMLElement);
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('2 unsaved changes');
    const fields = Array.from(bar.querySelectorAll('li')).map((item) => item.textContent);
    expect(fields).toEqual([
      'Entrants advancing per group',
      'Bands (only if the next stage has more than one zone)',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('Entrants advancing per group') as HTMLInputElement).value).toBe(
      '1',
    );
    expect(screen.getAllByRole('button', { name: 'Remove band' })).toHaveLength(2);
  });

  it('saves the edited plan with its next stage, advance count and bands', async () => {
    const onSave = renderTemplate();

    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save promotion plan' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [next, advance, bands] = onSave.mock.calls[0] as unknown as [
      string,
      string,
      { zoneRef: string; count: string }[],
    ];
    expect([next, advance]).toEqual(['3', '1']);
    expect(bands.map(({ zoneRef, count }) => [zoneRef, count])).toEqual([
      ['gold', '2'],
      ['silver', '1'],
    ]);
  });

  it('offers a plan that was never saved for saving straight away', () => {
    renderTemplate({ zone: undefined });

    expect(screen.getByRole('status').textContent).toContain('2 unsaved changes');
    expect(screen.getByRole('button', { name: 'Save promotion plan' })).toBeDefined();
  });

  it('shows the band each candidate lands in only when the plan declares bands', () => {
    const { unmount } = render(
      withIntl(
        <PromotionPlanTemplate
          entrantLabel={(id) => `Entrant ${id}`}
          onSave={() => Promise.resolve()}
          preview={preview}
          previewError={undefined}
          tournamentAlias="apertura-2026"
          zone={zoneWithPlan}
          zoneNumber={1}
        />,
      ),
    );

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Position',
      'Entrant',
      'Position in group',
      'Band',
    ]);
    expect(screen.getByRole('row', { name: /Entrant c\s+3\s+silver/ })).toBeDefined();
    unmount();

    render(
      withIntl(
        <PromotionPlanTemplate
          entrantLabel={(id) => `Entrant ${id}`}
          onSave={() => Promise.resolve()}
          preview={{ ...preview, bands: undefined }}
          previewError={undefined}
          tournamentAlias="apertura-2026"
          zone={zoneWithPlan}
          zoneNumber={1}
        />,
      ),
    );
    expect(screen.queryByRole('columnheader', { name: 'Band' })).toBeNull();
  });

  it('shows an informational note or an alert in place of the candidate table', () => {
    const { unmount } = render(
      withIntl(
        <PromotionPlanTemplate
          entrantLabel={(id) => id}
          onSave={() => Promise.resolve()}
          preview={undefined}
          previewError={{ message: 'No plan yet.', tone: 'info' }}
          tournamentAlias="apertura-2026"
          zone={zoneWithPlan}
          zoneNumber={1}
        />,
      ),
    );
    expect(screen.getByText('No plan yet.')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();

    render(
      withIntl(
        <PromotionPlanTemplate
          entrantLabel={(id) => id}
          onSave={() => Promise.resolve()}
          preview={undefined}
          previewError={{ message: 'Preview failed.', tone: 'destructive' }}
          tournamentAlias="apertura-2026"
          zone={zoneWithPlan}
          zoneNumber={1}
        />,
      ),
    );
    expect(screen.getByRole('alert').textContent).toContain('Preview failed.');
  });
});
