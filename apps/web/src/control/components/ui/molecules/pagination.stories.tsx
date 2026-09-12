import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Pagination } from './pagination.js';
import { storyText } from '../story-text.js';
import { StoryMatrix } from '../story-matrix.js';

/**
 * The three labels `Pagination` now requires. Sourced from the catalogue, which
 * is the whole point: they defaulted to the literals `'Previous'`, `'Next'` and
 * `'Pagination'`, so the control stayed English in all eight languages.
 */
function useLabels() {
  const intl = useIntl();
  return {
    previousLabel: intl.formatMessage(storyText.cancel),
    nextLabel: intl.formatMessage(storyText.save),
    navigationLabel: intl.formatMessage(storyText.tournaments),
  };
}

const meta = {
  title: 'Admin/Molecules/Pagination',
  component: Pagination,
  args: {
    page: 1,
    pageCount: 1,
    onPageChange: () => undefined,
    previousLabel: '',
    nextLabel: '',
    navigationLabel: '',
  },
  argTypes: {
    page: { control: { type: 'number', min: 1 } },
    pageCount: { control: { type: 'number', min: 1 } },
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { page: 3, pageCount: 9 },
  render: function Render(args) {
    const labels = useLabels();
    const [page, setPage] = useState(args.page);
    return <Pagination {...labels} {...args} onPageChange={setPage} page={page} />;
  },
};

/**
 * The boundaries, where the buttons disable themselves: first page, last page,
 * and a single page where both are disabled at once.
 *
 * Note what the language selector does *not* change here. `Pagination` defaults
 * `previousLabel`/`nextLabel` to the literals `'Previous'` and `'Next'` and
 * hardcodes `aria-label="Pagination"`, so it stays English under every
 * selection — the debt `scripts/check-ui-text-catalogue-coverage.mjs` records
 * against this file and `0214` owns. Left visible on purpose: a story that
 * passed translated labels in would hide the only evidence.
 */
export const Boundaries: Story = {
  args: { page: 1, pageCount: 1 },
  render: function Render() {
    const labels = useLabels();
    const noop = () => undefined;
    return (
      <StoryMatrix
        minColumn="220px"
        cells={[
          {
            label: 'first of 9',
            children: <Pagination {...labels} onPageChange={noop} page={1} pageCount={9} />,
          },
          {
            label: 'middle',
            children: <Pagination {...labels} onPageChange={noop} page={5} pageCount={9} />,
          },
          {
            label: 'last of 9',
            children: <Pagination {...labels} onPageChange={noop} page={9} pageCount={9} />,
          },
          {
            label: 'single page',
            children: <Pagination {...labels} onPageChange={noop} page={1} pageCount={1} />,
          },
        ]}
      />
    );
  },
};
