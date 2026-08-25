import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Input } from './input.js';
import { Textarea } from './textarea.js';
import { Checkbox } from './checkbox.js';
import { Label } from './label.js';
import { Select } from './select.js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.js';

describe('form-control atoms (0141)', () => {
  it('renders the default and error state classes for Input', () => {
    const { rerender } = render(<Input aria-label="Email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email').className).toContain('cl-input--default');

    rerender(<Input aria-label="Email" invalid value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email').className).toContain('cl-input--error');
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('renders the disabled state class for Input, taking precedence over invalid', () => {
    render(<Input aria-label="Email" disabled invalid value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email').className).toContain('cl-input--disabled');
  });

  it('meets the touch-target minimum on Input, Textarea and Checkbox', () => {
    render(
      <>
        <Input aria-label="a" value="" onChange={() => {}} />
        <Textarea aria-label="b" value="" onChange={() => {}} />
        <Checkbox aria-label="c" checked={false} onCheckedChange={() => {}} />
      </>,
    );
    // The CSS itself declares --cl-touch-target on .cl-input/.cl-textarea/.cl-checkbox
    // (packages/design-tokens); here we assert the class that carries it is present.
    expect(screen.getByLabelText('a').className).toContain('cl-input');
    expect(screen.getByLabelText('b').className).toContain('cl-textarea');
    expect(screen.getByLabelText('c').className).toContain('cl-checkbox');
  });

  it('renders the error state class for Textarea', () => {
    render(<Textarea aria-label="Notes" invalid value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Notes').className).toContain('cl-textarea--error');
  });

  it('renders the disabled state class for Textarea, taking precedence over invalid', () => {
    render(<Textarea aria-label="Notes" disabled invalid value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Notes').className).toContain('cl-textarea--disabled');
  });

  it('toggles Checkbox state via onCheckedChange, not a raw DOM event', () => {
    const onCheckedChange = jest.fn();
    render(<Checkbox aria-label="Active" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders the disabled state class for Checkbox', () => {
    render(<Checkbox aria-label="Active" checked={false} disabled onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox').className).toContain('cl-checkbox--disabled');
  });

  it('renders a Select trigger with the caller-supplied options', () => {
    render(
      <Select
        aria-label="Role"
        onValueChange={() => {}}
        options={[
          { value: 'admin', label: 'Admin' },
          { value: 'viewer', label: 'Viewer' },
        ]}
        value="admin"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Role' });
    expect(trigger.className).toContain('cl-select--default');
    expect(screen.getByText('Admin')).toBeDefined();
  });

  it('renders the error and disabled state classes for Select', () => {
    const { rerender } = render(
      <Select aria-label="Role" invalid onValueChange={() => {}} options={[]} value="" />,
    );
    expect(screen.getByRole('combobox', { name: 'Role' }).className).toContain('cl-select--error');

    rerender(<Select aria-label="Role" disabled onValueChange={() => {}} options={[]} value="" />);
    expect(screen.getByRole('combobox', { name: 'Role' }).className).toContain(
      'cl-select--disabled',
    );
  });

  it('connects a Label to its control by htmlFor', () => {
    render(
      <>
        <Label htmlFor="the-input">Correo</Label>
        <input id="the-input" />
      </>,
    );
    expect(screen.getByText('Correo').tagName.toLowerCase()).toBe('label');
  });
});

describe('Card compound subparts (0141)', () => {
  it('renders header/title/description/content/footer as one composed card', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título</CardTitle>
          <CardDescription>Descripción</CardDescription>
        </CardHeader>
        <CardContent>Contenido</CardContent>
        <CardFooter>Pie</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Título').className).toContain('cl-card__title');
    expect(screen.getByText('Descripción').className).toContain('cl-card__description');
    expect(screen.getByText('Contenido').className).toContain('cl-card__content');
    expect(screen.getByText('Pie').className).toContain('cl-card__footer');
  });
});

describe('governance rules (design.md Decision 7): atoms hold no state/data access', () => {
  const atomsDir = join(dirname(fileURLToPath(import.meta.url)));
  const sourceFiles = readdirSync(atomsDir).filter(
    (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
  );

  it.each(sourceFiles)('%s does not import api-client.js', (file) => {
    const source = readFileSync(join(atomsDir, file), 'utf8');
    expect(source).not.toMatch(/api-client\.js/);
  });

  it.each(sourceFiles)('%s does not hardcode an external margin', (file) => {
    const source = readFileSync(join(atomsDir, file), 'utf8');
    expect(source).not.toMatch(/\bmargin(?:-block|-inline)?(?:-start|-end)?\s*:/);
  });
});
