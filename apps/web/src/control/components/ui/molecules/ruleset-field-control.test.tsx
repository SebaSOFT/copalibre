import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { withIntl } from '../../../i18n/test-support.js';
import { RulesetFieldControl } from './ruleset-field-control.js';
import type { FieldPolicy } from '@copalibre/domain';

const REPLACED_BOOLEAN: FieldPolicy = { permission: { kind: 'replaced' }, mutationClass: 'safe' };
const REPLACED_NUMBER: FieldPolicy = { permission: { kind: 'replaced' }, mutationClass: 'safe' };
const REPLACED_TEXT: FieldPolicy = { permission: { kind: 'replaced' }, mutationClass: 'safe' };
const UNION_LIST: FieldPolicy = {
  permission: { kind: 'merged', strategy: 'union-list' },
  mutationClass: 'requires_rebuild',
};
const SHALLOW_OBJECT: FieldPolicy = {
  permission: { kind: 'merged', strategy: 'shallow-object' },
  mutationClass: 'requires_rebuild',
};

const TEXT_PROPS = {
  label: 'Story field',
  addLabel: 'Add',
  removeLabel: 'Remove',
  inheritedHeading: 'Already includes:',
  unrecognizedText: 'Not governed by a known rule policy',
  unknownTypeText: 'Unknown type',
};

describe('RulesetFieldControl', () => {
  it('renders a checkbox for a replaced boolean field and reports the toggled value', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={false}
          dotPath="venuePolicy.neutralGround"
          id="field-1"
          onChange={onChange}
          overrideValue={undefined}
          policy={REPLACED_BOOLEAN}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders a number input for a replaced number field and reports a numeric value', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={2}
          dotPath="scoring.pointsPerWin"
          id="field-2"
          onChange={onChange}
          overrideValue={3}
          policy={REPLACED_NUMBER}
        />,
      ),
    );
    const input = screen.getByDisplayValue('3') as HTMLInputElement;
    expect(input.type).toBe('number');
    fireEvent.change(input, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('renders a text input for a replaced string field', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={undefined}
          dotPath="identityRules.federationCode"
          id="field-3"
          onChange={onChange}
          overrideValue="ORB-1"
          policy={REPLACED_TEXT}
        />,
      ),
    );
    const input = screen.getByDisplayValue('ORB-1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ORB-2' } });
    expect(onChange).toHaveBeenCalledWith('ORB-2');
  });

  it('constrains the format field to the available formats', () => {
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={['single-elimination', 'round-robin']}
          disciplineDefaultValue={undefined}
          dotPath="format"
          id="field-4"
          onChange={() => undefined}
          overrideValue="round-robin"
          policy={REPLACED_BOOLEAN}
        />,
      ),
    );
    const options = screen.getAllByRole('option', { hidden: true }) as HTMLOptionElement[];
    expect(options.map((option) => option.value)).toEqual(['single-elimination', 'round-robin']);
  });

  it('reports only the added items for a union-list field, never the inherited ones', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={['points', 'score-difference']}
          dotPath="tiebreakers"
          id="field-5"
          label="Tiebreakers"
          onChange={onChange}
          overrideValue={[]}
          policy={UNION_LIST}
        />,
      ),
    );
    expect(screen.getByText(/points, score-difference/)).toBeDefined();
    // The "add" input is labeled with the field's human name, not its raw id.
    fireEvent.change(screen.getByLabelText('Tiebreakers'), { target: { value: 'goals-against' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith(['goals-against']);
  });

  it('reports only the touched subkey for a shallow-object field', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={{ regulationCount: 2, overtimeEnabled: false }}
          dotPath="segments"
          id="field-6"
          onChange={onChange}
          overrideValue={undefined}
          policy={SHALLOW_OBJECT}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ overtimeEnabled: true });
  });

  it('renders no control for a forbidden field', () => {
    const { container } = render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={false}
          dotPath="identityRules.federationCode"
          id="field-7"
          onChange={() => undefined}
          overrideValue={undefined}
          policy={{ permission: { kind: 'forbidden' }, mutationClass: 'safe' }}
        />,
      ),
    );
    expect(container.querySelector('input, select, button')).toBeNull();
  });

  it('renders raw JSON for an undeclared field and only propagates valid JSON', () => {
    const onChange = jest.fn();
    render(
      withIntl(
        <RulesetFieldControl
          {...TEXT_PROPS}
          availableFormats={[]}
          disciplineDefaultValue={undefined}
          dotPath="legacyField"
          id="field-8"
          onChange={onChange}
          overrideValue="old"
          policy={undefined}
        />,
      ),
    );
    expect(screen.getByText(/Not governed by a known rule policy/)).toBeDefined();
    const input = screen.getByDisplayValue('"old"') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-json' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '"new"' } });
    expect(onChange).toHaveBeenCalledWith('new');
  });
});
