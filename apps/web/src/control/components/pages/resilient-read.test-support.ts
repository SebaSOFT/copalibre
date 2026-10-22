import { expect } from '@jest/globals';
import { screen } from '@testing-library/react';

export async function expectReadRetry(): Promise<void> {
  expect((await screen.findAllByRole('button', { name: 'Retry' })).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Couldn't load .+\. Retrying in 2 s\./).length).toBeGreaterThan(0);
}

export async function expectFirstReadFailure(): Promise<void> {
  await expectReadRetry();
  expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(document.querySelector('.cl-interaction-empty-state')).toBeNull();
}
