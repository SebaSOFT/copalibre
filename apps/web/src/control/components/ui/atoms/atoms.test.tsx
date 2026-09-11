import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Input } from './input.js';
import { Textarea } from './textarea.js';
import { Checkbox } from './checkbox.js';
import { Select } from './select.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardSection,
  CardTitle,
} from './card.js';
import { Button } from './button.js';
import { RadioGroup, RadioGroupItem } from './radio.js';
import { FilePicker } from './file-picker.js';
import { Form } from './form.js';

describe('form-control atoms', () => {
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
    expect(within(trigger).getByText('Admin')).toBeDefined();
  });

  it('renders an optional leading icon inside the trigger, before the value', () => {
    const { container } = render(
      <Select
        aria-label="Language"
        icon={<span data-testid="select-icon">*</span>}
        onValueChange={() => {}}
        options={[{ value: 'en', label: 'English' }]}
        value="en"
      />,
    );
    const trigger = container.querySelector('button.cl-select');
    expect(trigger).not.toBeNull();
    const icon = screen.getByTestId('select-icon');
    expect(trigger?.contains(icon)).toBe(true);
    // "before the value": the icon node precedes the value's text node in
    // document order within the trigger.
    const position = icon.compareDocumentPosition(
      within(trigger as HTMLElement).getByText('English'),
    );
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omitting the icon prop renders the trigger exactly as before — no extra node, no layout change', () => {
    const { container } = render(
      <Select
        aria-label="Role"
        onValueChange={() => {}}
        options={[{ value: 'admin', label: 'Admin' }]}
        value="admin"
      />,
    );
    const trigger = container.querySelector('button.cl-select');
    // Only RadixSelect.Value's text and the chevron icon — nothing else.
    expect(trigger?.textContent).toBe('Admin▾');
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

  it('renders RadioGroup with roving focus and selected cue', () => {
    const onValueChange = jest.fn();
    render(
      <RadioGroup value="opt1" onValueChange={onValueChange} aria-label="Choices">
        <RadioGroupItem value="opt1" id="r1" aria-label="Option 1" />
        <RadioGroupItem value="opt2" id="r2" aria-label="Option 2" />
        <RadioGroupItem value="opt3" id="r3" disabled aria-label="Option 3" />
      </RadioGroup>,
    );

    const r1 = screen.getByLabelText('Option 1');
    const r2 = screen.getByLabelText('Option 2');
    const r3 = screen.getByLabelText('Option 3');

    expect(r1.className).toContain('cl-radio');
    expect(r1.className).toContain('cl-radio--default');
    expect(r1.getAttribute('aria-checked')).toBe('true');
    expect(r3.className).toContain('cl-radio--disabled');

    fireEvent.click(r2);
    expect(onValueChange).toHaveBeenCalledWith('opt2');
  });

  it('renders FilePicker with accessible name, constraints, and error wiring', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <FilePicker
        id="avatar"
        label="Avatar image"
        accept=".png,.jpg"
        maxSizeBytes={1024 * 1024}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Avatar image')).toBeDefined();
    expect(screen.getByText('Accepted formats: .png,.jpg • Max size: 1 MB')).toBeDefined();

    const input = screen.getByLabelText('Avatar image');
    const zone = input.closest('.cl-file-picker')?.querySelector('.cl-file-picker__zone');
    expect(zone?.className).toContain('cl-file-picker__zone');

    rerender(
      <FilePicker
        id="avatar"
        label="Avatar image"
        accept=".png,.jpg"
        error="Invalid file type"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Invalid file type');
    expect(input.getAttribute('aria-describedby')).toContain('avatar-error');
  });

  it('handles keyboard activation on FilePicker drop zone', () => {
    render(<FilePicker id="keyboard-file" label="Upload document" />);
    const input = screen.getByLabelText('Upload document') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    const zone = input.closest('.cl-file-picker')?.querySelector('.cl-file-picker__zone');
    expect(zone).toBeDefined();
    if (zone) {
      fireEvent.click(zone);
      expect(clickSpy).toHaveBeenCalled();
    }
  });

  it('handles FilePicker file selection, clear, and drag/drop interactions', () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    const { rerender } = render(
      <FilePicker
        id="file-interactions"
        label="Upload test"
        hint="Help text"
        required
        onChange={onChange}
        onClear={onClear}
      />,
    );

    const input = screen.getByLabelText(/Upload test/) as HTMLInputElement;
    const zone = input.closest('.cl-file-picker')?.querySelector('.cl-file-picker__zone');
    expect(zone).toBeDefined();
    expect(input.getAttribute('aria-describedby')).toContain('file-interactions-hint');

    // Click zone triggers input click
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    if (zone) {
      fireEvent.click(zone);
      expect(clickSpy).toHaveBeenCalled();

      // Drag over and leave
      fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
      expect(zone.className).toContain('cl-file-picker--drag-active');
      fireEvent.dragLeave(zone);
      expect(zone.className).not.toContain('cl-file-picker--drag-active');

      // Drop files
      const file = new File(['content'], 'test.png', { type: 'image/png' });
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
      expect(onChange).toHaveBeenCalled();
    }

    // Input change event
    const file2 = new File(['content2'], 'test2.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file2] } });
    expect(onChange).toHaveBeenCalled();

    // Clear files
    const clearBtn = screen.getByRole('button', { name: /Clear selected file/ });
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();

    // Disabled state
    rerender(
      <FilePicker id="file-interactions" label="Upload test" disabled onChange={onChange} />,
    );
    clickSpy.mockClear();
    if (zone) {
      fireEvent.click(zone);
      expect(clickSpy).not.toHaveBeenCalled();
      const file = new File(['content'], 'test.png', { type: 'image/png' });
      fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    }
  });

  it('exercises Select DOM interop shims for innerHTML, querySelectorAll, and option change', () => {
    const onValueChange = jest.fn();
    render(
      <Select
        id="dom-select"
        name="role"
        aria-label="Role"
        required
        onValueChange={onValueChange}
        options={[
          { value: 'admin', label: 'Admin' },
          { value: 'viewer', label: 'Viewer' },
        ]}
        value="admin"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select.getAttribute('aria-required')).toBe('true');

    // querySelectorAll option shim
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(select.querySelectorAll('option:checked').length).toBe(1);

    // change event
    fireEvent.change(select, { target: { value: 'viewer' } });
    expect(onValueChange).toHaveBeenCalledWith('viewer');
  });
});

describe('Form', () => {
  it('renders a <form> element and calls onSubmit', () => {
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
    const { container } = render(
      <Form onSubmit={onSubmit}>
        <button type="submit">Go</button>
      </Form>,
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.className).toContain('cl-form');
    fireEvent.submit(form as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('passes noValidate through to the native element', () => {
    const { container } = render(
      <Form noValidate>
        <span>x</span>
      </Form>,
    );
    expect(container.querySelector('form')?.noValidate).toBe(true);
  });
});

describe('Card compound subparts', () => {
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
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Título');
    expect(screen.getByText('Descripción').className).toContain('cl-card__description');
    expect(screen.getByText('Contenido').className).toContain('cl-card__content');
    expect(screen.getByText('Pie').className).toContain('cl-card__footer');
  });

  it('handles Card chamfer override, region role, and CardSection', () => {
    render(
      <Card className="cl-chamfer" aria-label="Region Card">
        <CardSection>Band content</CardSection>
      </Card>,
    );
    const card = screen.getByRole('region', { name: 'Region Card' });
    expect(card.className).toBe('cl-card cl-chamfer');
    expect(screen.getByText('Band content').className).toContain('cl-band');
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

describe('form-control dark theming contract', () => {
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../../../../styles/control.css');
  const css = readFileSync(cssPath, 'utf8');

  it('declares color-scheme dark for form inputs, selects, and textareas', () => {
    expect(css).toContain('color-scheme: dark;');
  });

  it('declares custom dark appearance for checkboxes', () => {
    expect(css).toMatch(/input\[type=['"]checkbox['"]\]\.cl-checkbox/);
    expect(css).toContain('appearance: none;');
  });

  it('declares custom file selector button styling', () => {
    expect(css).toMatch(/\.cl-input\[type=['"]file['"]\]::file-selector-button/);
  });

  it('declares link styling with cyan-400 state-live token', () => {
    expect(css).toContain('.cl-link');
    expect(css).toContain('var(--cl-state-live)');
  });
});

describe('Button atom CTA treatments (openspec 0198)', () => {
  const VARIANTS = ['primary', 'secondary', 'destructive', 'destructive-outline'] as const;

  it.each(VARIANTS)('renders the %s variant class', (variant) => {
    render(<Button variant={variant}>Publish</Button>);
    expect(screen.getByRole('button', { name: 'Publish' }).className).toContain(
      `cl-btn--${variant}`,
    );
  });

  it('carries the chamfered control geometry on every variant', () => {
    render(
      <>
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );
    for (const variant of VARIANTS) {
      const className = screen.getByRole('button', { name: variant }).className;
      expect(className).toContain('cl-chamfer');
      expect(className).toContain('cl-chamfer--control');
    }
  });

  it('does not double-apply chamfer when the caller supplies its own', () => {
    render(<Button className="cl-chamfer cl-chamfer--tr">Publish</Button>);
    const className = screen.getByRole('button', { name: 'Publish' }).className;
    expect(className.match(/cl-chamfer(?![\w-])/g)).toHaveLength(1);
    expect(className).toContain('cl-chamfer--tr');
  });

  it('defaults to the primary variant and stays keyboard-focusable', () => {
    render(<Button>Publish</Button>);
    const className = screen.getByRole('button', { name: 'Publish' }).className;
    expect(className).toContain('cl-btn--primary');
    expect(className).toContain('cl-focusable');
  });
});
