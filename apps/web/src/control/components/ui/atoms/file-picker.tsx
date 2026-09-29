import * as React from 'react';

export interface FilePickerProps {
  readonly id: string;
  readonly name?: string;
  readonly label: string;
  readonly 'aria-label'?: string;
  readonly accept?: string;
  readonly maxSizeBytes?: number;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly error?: string;
  readonly hint?: string;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly clearLabel?: string;
  readonly value?: File | FileList | readonly File[] | null;
  readonly onChange?: (files: FileList | null) => void;
  readonly onClear?: () => void;
  /**
   * Localized copy this atom itself may not resolve (R6: no react-intl call
   * in an atom/molecule) — every caller builds this via `filePickerLabels(intl)`
   * and passes it down, the same way `matchCardLabels`/`seriesStateBarLabels`
   * pre-resolve a shared component's copy for its consumer (openspec 0285).
   * English defaults keep every existing call site working unchanged.
   */
  readonly promptText?: string;
  readonly promptDraggingText?: string;
  readonly acceptedFormatsLabel?: string;
  readonly maxSizeLabel?: string;
  readonly clearButtonText?: string;
  /** Formats the visible "N files selected" text for the current count — a function, not a pre-resolved string, since the count is only known once files are chosen. */
  readonly formatFilesSelected?: (count: number) => string;
}

/** Exported so `filePickerLabels(intl)` can embed a locale-agnostic size figure into its localized "Max size" template. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/**
 * Extracted from `FilePicker` itself (openspec 0285) so this logic's own
 * branches score separately rather than adding to that component's already
 * substantial complexity — the same remediation this file's own CRAP-score
 * register already applies elsewhere in this codebase.
 */
function resolveConstraintsText(options: {
  readonly accept?: string;
  readonly maxSizeBytes?: number;
  readonly acceptedFormatsLabel?: string;
  readonly maxSizeLabel?: string;
}): string {
  return [
    options.accept
      ? (options.acceptedFormatsLabel ?? `Accepted formats: ${options.accept}`)
      : undefined,
    options.maxSizeBytes
      ? (options.maxSizeLabel ?? `Max size: ${formatFileSize(options.maxSizeBytes)}`)
      : undefined,
  ]
    .filter(Boolean)
    .join(' • ');
}

export function FilePicker({
  id,
  name,
  label,
  'aria-label': ariaLabel,
  clearLabel = 'Clear selected file',
  accept,
  maxSizeBytes,
  multiple = false,
  disabled = false,
  required = false,
  error,
  hint,
  className = '',
  value,
  onChange,
  onClear,
  promptText = 'Choose a file or drag here',
  promptDraggingText = 'Drop file here',
  acceptedFormatsLabel,
  maxSizeLabel,
  clearButtonText = 'Clear',
  formatFilesSelected = (count) => `${count} files selected`,
}: FilePickerProps): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [internalFiles, setInternalFiles] = React.useState<FileList | null>(null);

  const selectedFiles =
    value !== undefined
      ? value instanceof FileList
        ? value
        : Array.isArray(value)
          ? value
          : value
            ? [value]
            : null
      : internalFiles;
  const fileCount = selectedFiles ? selectedFiles.length : 0;
  const firstFileName =
    selectedFiles && selectedFiles.length > 0 && selectedFiles[0] ? selectedFiles[0].name : '';

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [error ? errorId : undefined, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined;

  let state = 'default';
  if (disabled) {
    state = 'disabled';
  } else if (error) {
    state = 'error';
  } else if (isDragging) {
    state = 'drag-active';
  } else if (fileCount > 0) {
    state = 'selection-present';
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setInternalFiles(files);
    onChange?.(files);
  };

  const handleClear = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setInternalFiles(null);
    onChange?.(null);
    onClear?.();
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      try {
        if (inputRef.current) {
          inputRef.current.files = files;
        }
      } catch {
        // Ignored if FileList cannot be assigned directly in the environment
      }
      setInternalFiles(files);
      onChange?.(files);
    }
  };

  const constraintsText = resolveConstraintsText({
    accept,
    maxSizeBytes,
    acceptedFormatsLabel,
    maxSizeLabel,
  });

  return (
    <div className={`cl-file-picker cl-file-picker--${state} ${className}`}>
      <label className="cl-label" htmlFor={id} id={`${id}-label`}>
        {label} {required && <span aria-hidden="true">*</span>}
      </label>

      <div
        className={`cl-file-picker__zone cl-file-picker--${state}`}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          name={name ?? id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel || label}
          aria-describedby={describedBy}
          className="cl-file-picker__input cl-focusable"
          onChange={handleInputChange}
        />

        {fileCount > 0 ? (
          <div className="cl-file-picker__selection">
            <span className="cl-file-picker__filename">
              {fileCount === 1 ? firstFileName : formatFilesSelected(fileCount)}
            </span>
            {!disabled && (
              <button
                type="button"
                className="cl-btn cl-btn--secondary cl-file-picker__clear"
                onClick={handleClear}
                aria-label={clearLabel}
              >
                {clearButtonText}
              </button>
            )}
          </div>
        ) : (
          <div className="cl-file-picker__prompt">
            <span className="cl-file-picker__trigger-text">
              {isDragging ? promptDraggingText : promptText}
            </span>
            {constraintsText && (
              <span className="cl-file-picker__constraints" id={hintId}>
                {constraintsText}
              </span>
            )}
          </div>
        )}
      </div>

      {hint && !constraintsText && (
        <span className="cl-form-hint" id={hintId}>
          {hint}
        </span>
      )}

      {error && (
        <span className="cl-form-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
