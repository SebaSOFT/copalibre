import { useState } from 'react';
import { useIntl } from 'react-intl';
import { filePickerLabels } from '../lib/file-picker-labels.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { Stack } from './ui/atoms/layout/stack.js';
import { DropZone } from './ui/organisms/drop-zone.js';
import { FramedImage } from './FramedImage.js';
import { ImageCropModal } from './ImageCropModal.js';
import { ClubEmblemPlaceholder } from './placeholders.js';

/** The cropped emblem the operator picked, held until the tournament exists to receive it. */
export interface WizardEmblem {
  readonly contentBase64: string;
  readonly contentType: 'image/png';
}

/**
 * The media pane of the wizard's first step: the same emblem preview and drop zone the tournament
 * settings screen offers, but with no tournament to upload to yet, so a pick is kept by the wizard
 * and sent once the tournament is created.
 */
export function WizardEmblemPane({
  emblem,
  onChange,
}: {
  readonly emblem: WizardEmblem | undefined;
  readonly onChange: (emblem: WizardEmblem | undefined) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [cropSrc, setCropSrc] = useState<string | undefined>(undefined);
  const previewSrc =
    emblem === undefined ? undefined : `data:${emblem.contentType};base64,${emblem.contentBase64}`;

  return (
    <Stack gap="4">
      <h3 className="cl-wizard-step-split__heading">
        {intl.formatMessage(messages.settingsEmblemHeading)}
      </h3>
      <FramedImage
        key={previewSrc === undefined ? 'none' : 'picked'}
        alt={intl.formatMessage(messages.settingsEmblemAlt)}
        placeholder={
          <ClubEmblemPlaceholder
            size={96}
            title={intl.formatMessage(messages.settingsEmblemPlaceholderAlt)}
          />
        }
        size={96}
        src={previewSrc}
      />
      <DropZone
        accept="image/*"
        aria-label={intl.formatMessage(messages.settingsUploadEmblem)}
        className="cl-drop-zone--stacked"
        id="wizard-emblem-upload"
        label={intl.formatMessage(messages.settingsUploadEmblem)}
        onChange={(files) => {
          const file = files?.[0];
          if (file) setCropSrc(URL.createObjectURL(file));
        }}
        {...filePickerLabels(intl, { accept: 'image/*' })}
      />
      <p className="cl-form-field__help">{intl.formatMessage(messages.wizardEmblemHelp)}</p>
      {emblem !== undefined && (
        <Button onClick={() => onChange(undefined)} type="button" variant="secondary">
          {intl.formatMessage(messages.settingsRemoveEmblem)}
        </Button>
      )}
      {cropSrc !== undefined && (
        <ImageCropModal
          imageSrc={cropSrc}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(undefined);
          }}
          onConfirm={(output) => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(undefined);
            onChange(output);
          }}
        />
      )}
    </Stack>
  );
}
