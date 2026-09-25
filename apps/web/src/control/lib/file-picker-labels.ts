import type { IntlShape } from 'react-intl';
import { formatFileSize } from '../components/ui/atoms/file-picker.js';
import { messages } from '../i18n/messages.en.js';

/** The subset of `FilePickerProps` this builds — every localized string prop the atom itself may not resolve (R6). */
export interface FilePickerLabels {
  readonly promptText: string;
  readonly promptDraggingText: string;
  readonly acceptedFormatsLabel: string | undefined;
  readonly maxSizeLabel: string | undefined;
  readonly clearButtonText: string;
  readonly formatFilesSelected: (count: number) => string;
}

/**
 * Builds every localized string the `<FilePicker>` atom needs, from the
 * caller's own `useIntl()` — the atom cannot call `react-intl` itself (R6:
 * no i18n formatting below the organism tier), so every one of its six
 * production call sites spreads this into its props (openspec 0285).
 */
export function filePickerLabels(
  intl: IntlShape,
  options: { readonly accept?: string; readonly maxSizeBytes?: number } = {},
): FilePickerLabels {
  return {
    promptText: intl.formatMessage(messages.filePickerPrompt),
    promptDraggingText: intl.formatMessage(messages.filePickerPromptDragging),
    acceptedFormatsLabel:
      options.accept === undefined
        ? undefined
        : intl.formatMessage(messages.filePickerAcceptedFormats, { formats: options.accept }),
    maxSizeLabel:
      options.maxSizeBytes === undefined
        ? undefined
        : intl.formatMessage(messages.filePickerMaxSize, {
            size: formatFileSize(options.maxSizeBytes),
          }),
    clearButtonText: intl.formatMessage(messages.filePickerClear),
    formatFilesSelected: (count) => intl.formatMessage(messages.filePickerFilesSelected, { count }),
  };
}
