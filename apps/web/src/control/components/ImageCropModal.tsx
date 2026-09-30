import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useIntl } from 'react-intl';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { cropToPng, type CropArea } from '../lib/image-upload.js';
import { removeImageBackground, type BackgroundRemovalTask } from '../lib/background-removal.js';
import { messages } from '../i18n/messages.en.js';
import { Modal } from './ui/organisms/modal.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { Field } from './ui/molecules/field.js';

/**
 * Fixed 4:5 crop for every profile image (organization/club emblem, person
 * photo) — pan/zoom/rotate, confirm renders the crop to a 410×512 PNG via
 * `cropToPng`, cancel leaves the caller's prior upload state untouched.
 * Uses owned `Modal` organism, `Field`, and `Button` atoms.
 */
export interface ImageCropModalProps {
  readonly imageSrc: string;
  readonly onCancel: () => void;
  readonly onConfirm: (output: { contentBase64: string; contentType: 'image/png' }) => void;
  readonly removeBackground?: typeof removeImageBackground;
}

export function ImageCropModal({
  imageSrc,
  onCancel,
  onConfirm,
  removeBackground = removeImageBackground,
}: ImageCropModalProps): JSX.Element {
  const intl = useIntl();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [removalAttempt, setRemovalAttempt] = useState(0);
  const [removalPhase, setRemovalPhase] = useState<'removing' | 'failed' | 'cropping'>('removing');
  const [removalProgress, setRemovalProgress] = useState(0);
  const [cropSrc, setCropSrc] = useState<string | undefined>(undefined);
  const removalTask = useRef<BackgroundRemovalTask | undefined>(undefined);
  const cropObjectUrl = useRef<string | undefined>(undefined);

  const handleRetry = (): void => {
    setRemovalPhase('removing');
    setRemovalProgress(0);
    setCropSrc(undefined);
    setRemovalAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    let active = true;
    if (cropObjectUrl.current) URL.revokeObjectURL(cropObjectUrl.current);
    cropObjectUrl.current = undefined;
    void fetch(imageSrc)
      .then((response) => {
        if (!response.ok) throw new Error('Could not read selected image');
        return response.blob();
      })
      .then((source) => {
        if (!active) return undefined;
        const task = removeBackground(source, {
          onProgress: ({ current, total }) => {
            if (active && total > 0)
              setRemovalProgress(Math.min(100, Math.round((current / total) * 100)));
          },
        });
        removalTask.current = task;
        return task.result;
      })
      .then((result) => {
        if (!active || !result) return;
        const resultUrl = URL.createObjectURL(result);
        cropObjectUrl.current = resultUrl;
        setCropSrc(resultUrl);
        setRemovalPhase('cropping');
      })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setRemovalPhase('failed');
        }
      });
    return () => {
      active = false;
      removalTask.current?.cancel();
      removalTask.current = undefined;
      if (cropObjectUrl.current) URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = undefined;
    };
  }, [imageSrc, removalAttempt, removeBackground]);

  const handleConfirm = async (): Promise<void> => {
    if (!croppedAreaPixels || busy || !cropSrc || removalPhase !== 'cropping') return;
    setBusy(true);
    setError(false);
    try {
      const output = await cropToPng(cropSrc, croppedAreaPixels, rotation);
      onConfirm(output);
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const handleCancel = (): void => {
    removalTask.current?.cancel();
    onCancel();
  };

  return (
    <Modal
      closeLabel={intl.formatMessage(messages.imageCropModalClose)}
      footer={
        <>
          <Button disabled={busy} onClick={handleCancel} type="button" variant="secondary">
            {intl.formatMessage(messages.imageCropModalCancel)}
          </Button>
          {removalPhase === 'failed' && (
            <>
              <Button onClick={handleRetry} type="button" variant="secondary">
                {intl.formatMessage(messages.imageCropModalRetry)}
              </Button>
              <Button
                onClick={() => {
                  setCropSrc(imageSrc);
                  setRemovalPhase('cropping');
                }}
                type="button"
                variant="secondary"
              >
                {intl.formatMessage(messages.imageCropModalKeepOriginal)}
              </Button>
            </>
          )}
          <Button
            disabled={busy || !croppedAreaPixels || removalPhase !== 'cropping'}
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
        if (!open) handleCancel();
      }}
      open
      title={intl.formatMessage(messages.imageCropModalTitle)}
    >
      {removalPhase === 'removing' ? (
        <section aria-live="polite" aria-busy="true">
          <p>{intl.formatMessage(messages.imageCropModalRemoving)}</p>
          <progress
            aria-label={intl.formatMessage(messages.imageCropModalRemoving)}
            max={100}
            value={removalProgress}
          />
          <span>{removalProgress}%</span>
        </section>
      ) : removalPhase === 'failed' ? (
        <p className="cl-form-field__error" role="alert">
          {intl.formatMessage(messages.imageCropModalRemovalFailed)}
        </p>
      ) : (
        <div className="cl-image-frame">
          <Cropper
            aspect={4 / 5}
            crop={crop}
            image={cropSrc ?? imageSrc}
            onCropChange={setCrop}
            onCropComplete={(_area: Area, areaPixels: Area) => setCroppedAreaPixels(areaPixels)}
            onRotationChange={setRotation}
            onZoomChange={setZoom}
            rotation={rotation}
            zoom={zoom}
          />
        </div>
      )}

      {removalPhase === 'cropping' && (
        <div style={controlsStyle}>
          <Field id="crop-zoom" label={intl.formatMessage(messages.imageCropModalZoom)}>
            <Input
              id="crop-zoom"
              max={3}
              min={1}
              onChange={(event) => setZoom(Number(event.target.value))}
              step={0.01}
              type="range"
              value={zoom}
            />
          </Field>
          <Field id="crop-rotation" label={intl.formatMessage(messages.imageCropModalRotation)}>
            <Input
              id="crop-rotation"
              max={360}
              min={0}
              onChange={(event) => setRotation(Number(event.target.value))}
              step={1}
              type="range"
              value={rotation}
            />
          </Field>
        </div>
      )}

      {error && (
        <p className="cl-form-field__error" role="alert">
          {intl.formatMessage(messages.imageCropModalFailed)}
        </p>
      )}
    </Modal>
  );
}

const controlsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cl-space-2)',
  marginTop: 'var(--cl-space-3)',
};
