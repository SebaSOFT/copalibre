import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './pagination.js';
import { StoryMatrix } from '../story-matrix.js';

const meta = {
  title: 'Admin/Molecules/Pagination',
  component: Pagination,
  args: { page: 1, pageCount: 1, onPageChange: () => undefined },
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
    const [page, setPage] = useState(args.page);
    return <Pagination {...args} onPageChange={setPage} page={page} />;
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
    const noop = () => undefined;
    return (
      <StoryMatrix
        minColumn="220px"
        cells={[
          {
            label: 'first of 9',
            children: <Pagination onPageChange={noop} page={1} pageCount={9} />,
          },
          { label: 'middle', children: <Pagination onPageChange={noop} page={5} pageCount={9} /> },
          {
            label: 'last of 9',
            children: <Pagination onPageChange={noop} page={9} pageCount={9} />,
          },
          {
            label: 'single page',
            children: <Pagination onPageChange={noop} page={1} pageCount={1} />,
          },
        ]}
      />
    );
  },
};

/** Translated labels supplied by the caller, which is how a screen should use it. */
export const WithSuppliedLabels: Story = {
  args: { page: 2, pageCount: 4 },
  render: function Render(args) {
    const [page, setPage] = useState(args.page);
    return (
      <Pagination
        nextLabel="Siguiente"
        onPageChange={setPage}
        page={page}
        pageCount={args.pageCount}
        previousLabel="Anterior"
      />
    );
  },
};
