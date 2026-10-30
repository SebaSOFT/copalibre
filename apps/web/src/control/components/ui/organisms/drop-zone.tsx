import type { ReactNode } from 'react';
import { FilePicker, type FilePickerProps } from '../atoms/file-picker.js';
import { Icon } from '../atoms/icon.js';

export interface DropZoneProps extends FilePickerProps {
  readonly instruction?: ReactNode;
}

/** Image drop area composed around FilePicker's keyboard and file-selection behavior. */
export function DropZone({
  className = '',
  instruction,
  ...filePickerProps
}: DropZoneProps): React.JSX.Element {
  return (
    <div className={`cl-drop-zone ${className}`.trim()}>
      <div aria-hidden="true" className="cl-drop-zone__icon-well">
        <Icon name="upload" size={24} />
      </div>
      <div className="cl-drop-zone__content">
        {instruction !== undefined && <p className="cl-drop-zone__instruction">{instruction}</p>}
        <FilePicker {...filePickerProps} className="cl-drop-zone__picker" />
      </div>
    </div>
  );
}
