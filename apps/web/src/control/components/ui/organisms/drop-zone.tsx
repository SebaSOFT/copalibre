import { FilePicker, type FilePickerProps } from '../atoms/file-picker.js';
import { Icon } from '../atoms/icon.js';

export type DropZoneProps = FilePickerProps;

/**
 * Image drop area composed around FilePicker's keyboard and file-selection behavior. One box and
 * one instruction: the picker's own prompt is the instruction, so the zone adds no second line of
 * copy and the picker's zone draws no second box inside it.
 */
export function DropZone({ className = '', ...filePickerProps }: DropZoneProps): React.JSX.Element {
  return (
    <div className={`cl-drop-zone ${className}`.trim()}>
      <div aria-hidden="true" className="cl-drop-zone__icon-well">
        <Icon name="upload" size={24} />
      </div>
      <div className="cl-drop-zone__content">
        <FilePicker {...filePickerProps} className="cl-drop-zone__picker" />
      </div>
    </div>
  );
}
