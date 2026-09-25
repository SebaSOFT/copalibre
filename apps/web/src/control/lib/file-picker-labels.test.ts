import { createIntl, createIntlCache } from 'react-intl';
import { filePickerLabels } from './file-picker-labels.js';
import { messages } from '../i18n/messages.en.js';

const intl = createIntl(
  {
    locale: 'en',
    messages: Object.fromEntries(
      Object.values(messages).map((descriptor) => [descriptor.id, descriptor.defaultMessage]),
    ),
  },
  createIntlCache(),
);

describe('filePickerLabels', () => {
  it('always resolves the prompt and clear-button text', () => {
    const labels = filePickerLabels(intl);
    expect(labels.promptText).toBe('Choose a file or drag here');
    expect(labels.promptDraggingText).toBe('Drop file here');
    expect(labels.clearButtonText).toBe('Clear');
  });

  it('leaves acceptedFormatsLabel and maxSizeLabel undefined when the caller declares no constraint', () => {
    const labels = filePickerLabels(intl);
    expect(labels.acceptedFormatsLabel).toBeUndefined();
    expect(labels.maxSizeLabel).toBeUndefined();
  });

  it('resolves acceptedFormatsLabel from the declared accept string', () => {
    const labels = filePickerLabels(intl, { accept: '.csv,text/csv' });
    expect(labels.acceptedFormatsLabel).toBe('Accepted formats: .csv,text/csv');
  });

  it('resolves maxSizeLabel from the declared byte limit, in the same units the atom used to hardcode', () => {
    const labels = filePickerLabels(intl, { maxSizeBytes: 1024 * 1024 });
    expect(labels.maxSizeLabel).toBe('Max size: 1 MB');
  });

  it('pluralizes the selected-files count', () => {
    const labels = filePickerLabels(intl);
    expect(labels.formatFilesSelected(1)).toBe('1 file selected');
    expect(labels.formatFilesSelected(3)).toBe('3 files selected');
  });
});
