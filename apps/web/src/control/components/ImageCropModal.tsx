import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useIntl } from 'react-intl';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { cropToPng, type CropArea } from '../lib/image-upload.js';
import { messages } from '../i18n/messages.en.js';

/**
 * Fixed 4:5 crop for every profile image (organization/club emblem, person
 * photo) — pan/zoom/rotate, confirm renders the crop to a 410×512 PNG via
 * `cropToPng`, cancel leaves the caller's prior upload state untouched
 * (0122). Mirrors `RolesPermissionsPage.tsx`'s `InviteDialog` dialog
 * convention (`role="dialog"`, `aria-modal`, `cl-card cl-chamfer`, inline
 * `CSSProperties` for layout) and adds Escape-to-cancel.
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(messages.imageCropModalTitle)}
      style={overlayStyle}
    >
      <div className="cl-card cl-chamfer" style={dialogStyle}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>{intl.formatMessage(messages.imageCropModalTitle)}</h2>
          <button
            aria-label={intl.formatMessage(messages.imageCropModalClose)}
            className="cl-focusable"
            onClick={onCancel}
            style={closeStyle}
            type="button"
          >
            ×
          </button>
        </header>

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
          <label style={controlLabelStyle}>
            {intl.formatMessage(messages.imageCropModalZoom)}
            <input
              max={3}
              min={1}
              onChange={(event) => setZoom(Number(event.target.value))}
              step={0.01}
              type="range"
              value={zoom}
            />
          </label>
          <label style={controlLabelStyle}>
            {intl.formatMessage(messages.imageCropModalRotation)}
            <input
              max={360}
              min={0}
              onChange={(event) => setRotation(Number(event.target.value))}
              step={1}
              type="range"
              value={rotation}
            />
          </label>
        </div>

        {error && <p style={errorStyle}>{intl.formatMessage(messages.imageCropModalFailed)}</p>}

        <footer style={footerStyle}>
          <button
            className="cl-focusable"
            disabled={busy}
            onClick={onCancel}
            style={secondaryButtonStyle}
            type="button"
          >
            {intl.formatMessage(messages.imageCropModalCancel)}
          </button>
          <button
            className="cl-focusable"
            disabled={busy || !croppedAreaPixels}
            onClick={handleConfirm}
            style={primaryButtonStyle}
            type="button"
          >
            {busy
              ? intl.formatMessage(messages.imageCropModalProcessing)
              : intl.formatMessage(messages.imageCropModalConfirm)}
          </button>
        </footer>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10,
  display: 'grid',
  placeItems: 'center',
  background: 'color-mix(in srgb, var(--cl-surface-base) 84%, transparent)',
};

const dialogStyle: CSSProperties = {
  width: 'min(100%, 480px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cl-space-4)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const titleStyle: CSSProperties = { margin: 0, fontFamily: 'var(--cl-font-display)' };

const closeStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.5rem',
  lineHeight: 1,
  cursor: 'pointer',
};

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
};

const controlLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cl-space-1)',
  fontFamily: 'var(--cl-font-body)',
};

const errorStyle: CSSProperties = { color: 'var(--cl-state-cancelled)', margin: 0 };

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--cl-space-2)',
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: 40,
  background: 'transparent',
  border: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-primary)',
  padding: '0 var(--cl-space-3)',
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
  fontFamily: 'var(--cl-font-display)',
  fontSize: '1rem',
  minHeight: 40,
  padding: '0 var(--cl-space-4)',
  textTransform: 'uppercase',
};
