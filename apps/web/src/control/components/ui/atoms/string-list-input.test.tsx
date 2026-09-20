import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { StringListInput } from './string-list-input.js';

describe('StringListInput', () => {
  it('renders each item with a remove button', () => {
    render(
      <StringListInput
        addLabel="Add"
        items={['points', 'goals-for']}
        onAdd={() => undefined}
        onRemove={() => undefined}
        removeLabel="Remove"
      />,
    );
    expect(screen.getByText('points')).toBeDefined();
    expect(screen.getByText('goals-for')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('adds a typed item and clears the draft input', () => {
    const onAdd = jest.fn();
    render(
      <StringListInput
        addLabel="Add"
        items={[]}
        onAdd={onAdd}
        onRemove={() => undefined}
        removeLabel="Remove"
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'goals-against' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('goals-against');
    expect(input.value).toBe('');
  });

  it('disables Add while the draft is empty or only whitespace', () => {
    render(
      <StringListInput
        addLabel="Add"
        items={[]}
        onAdd={() => undefined}
        onRemove={() => undefined}
        removeLabel="Remove"
      />,
    );
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onRemove with the removed item's index", () => {
    const onRemove = jest.fn();
    render(
      <StringListInput
        addLabel="Add"
        items={['points', 'goals-for']}
        onAdd={() => undefined}
        onRemove={onRemove}
        removeLabel="Remove"
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1] as HTMLButtonElement);
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
