import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useIntl } from 'react-intl';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { cropToPng, type CropArea } from '../lib/image-upload.js';
import { messages } from '../i18n/messages.en.js';
import { Modal } from './ui/organisms/modal.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';

/**
 * Fixed 4:5 crop for every profile image (organization/club emblem, person
 * photo) — pan/zoom/rotate, confirm renders the crop to a 410×512 PNG via
 * `cropToPng`, cancel leaves the caller's prior upload state untouched.
 * Uses owned `Modal` organism, `FormField`, and `Button` atoms.
 */
export interface ImageCropModalProps {
  readonly imageSrc: string;
  readonly onCancel: () => void;
  readonly onConfirm: (output: { contentBase64: string; contentType: 'image/png' }) => void;
}

export function ImageCropModal({
  imageSrc,
  onCancel,
  onConfirm,
}: ImageCropModalProps): JSX.Element {
  const intl = useIntl();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    setError(false);
    try {
      const output = await cropToPng(imageSrc, croppedAreaPixels, rotation);
      onConfirm(output);
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <Modal
      footer={
        <>
          <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">
            {intl.formatMessage(messages.imageCropModalCancel)}
          </Button>
          <Button
            disabled={busy || !croppedAreaPixels}
            onClick={() => void handleConfirm()}
            type="button"
            variant="primary"
          >
            {busy
              ? intl.formatMessage(messages.imageCropModalProcessing)
              : intl.formatMessage(messages.imageCropModalConfirm)}
          </Button>
        </>
      }
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open
      title={intl.formatMessage(messages.imageCropModalTitle)}
    >
      <div style={cropAreaStyle}>
        <Cropper
          aspect={4 / 5}
          crop={crop}
          image={imageSrc}
          onCropChange={setCrop}
          onCropComplete={(_area: Area, areaPixels: Area) => setCroppedAreaPixels(areaPixels)}
          onRotationChange={setRotation}
          onZoomChange={setZoom}
          rotation={rotation}
          zoom={zoom}
        />
      </div>

      <div style={controlsStyle}>
        <FormField id="crop-zoom" label={intl.formatMessage(messages.imageCropModalZoom)}>
          <Input
            id="crop-zoom"
            max={3}
            min={1}
            onChange={(event) => setZoom(Number(event.target.value))}
            step={0.01}
            type="range"
            value={zoom}
          />
        </FormField>
        <FormField id="crop-rotation" label={intl.formatMessage(messages.imageCropModalRotation)}>
          <Input
            id="crop-rotation"
            max={360}
            min={0}
            onChange={(event) => setRotation(Number(event.target.value))}
            step={1}
            type="range"
            value={rotation}
          />
        </FormField>
      </div>

      {error && (
        <p className="cl-form-field__error" role="alert">
          {intl.formatMessage(messages.imageCropModalFailed)}
        </p>
      )}
    </Modal>
  );
}

const cropAreaStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '4 / 5',
  maxHeight: '60vh',
  background: 'var(--cl-surface-raised)',
};

const controlsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cl-space-2)',
  marginTop: 'var(--cl-space-3)',
};
