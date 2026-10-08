import { useIntl } from 'react-intl';
import { Card } from '../ui/atoms/card.js';
import { Select } from '../ui/atoms/select.js';
import { Button } from '../ui/atoms/button.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { messages } from '../../i18n/messages.en.js';
import {
  BROADCAST_CHROMA_OPTIONS,
  OBS_RESOLUTION_PRESETS,
  type BroadcastChroma,
  type BroadcastOverlayMode,
} from '../../lib/broadcaster-studio.js';

const CHROMA_LABEL_MESSAGE = {
  transparent: messages.broadcasterStudioChromaTransparent,
  green: messages.broadcasterStudioChromaGreen,
  magenta: messages.broadcasterStudioChromaMagenta,
  dark: messages.broadcasterStudioChromaDark,
} as const;

/**
 * Self-service streamer console: no data-fetching or
 * business logic here — `BroadcasterStudioPage.tsx` issues the token, builds
 * `overlayUrl`, and owns the copy-to-clipboard call; this composes the
 * result from owned primitives only.
 */
export function BroadcasterStudioTemplate({
  loading,
  error,
  overlayUrl,
  mode,
  chroma,
  onModeChange,
  onChromaChange,
  onCopy,
}: {
  readonly loading: boolean;
  readonly error?: string;
  readonly overlayUrl?: string;
  readonly mode: BroadcastOverlayMode;
  readonly chroma: BroadcastChroma;
  readonly onModeChange: (mode: BroadcastOverlayMode) => void;
  readonly onChromaChange: (chroma: BroadcastChroma) => void;
  readonly onCopy: () => void;
}): React.JSX.Element {
  const intl = useIntl();

  const listing = (
    <div className="cl-screen-sections">
      <p>{intl.formatMessage(messages.broadcasterStudioIntro)}</p>

      {error !== undefined && <p className="cl-form-field__error">{error}</p>}

      {loading ? (
        <p>{intl.formatMessage(messages.broadcasterStudioLoading)}</p>
      ) : overlayUrl !== undefined ? (
        <>
          <Card>
            <div className="cl-screen-sections">
              <Field
                id="broadcaster-studio-mode"
                label={intl.formatMessage(messages.broadcasterStudioModeLabel)}
              >
                <Select
                  id="broadcaster-studio-mode"
                  onValueChange={(value) => onModeChange(value as BroadcastOverlayMode)}
                  options={[
                    {
                      value: 'overlay-lower',
                      label: intl.formatMessage(messages.broadcasterStudioModeLower),
                    },
                    {
                      value: 'overlay-full',
                      label: intl.formatMessage(messages.broadcasterStudioModeFull),
                    },
                  ]}
                  value={mode}
                />
              </Field>

              <Field
                id="broadcaster-studio-chroma"
                label={intl.formatMessage(messages.broadcasterStudioChromaLabel)}
              >
                <Select
                  id="broadcaster-studio-chroma"
                  onValueChange={(value) => onChromaChange(value as BroadcastChroma)}
                  options={BROADCAST_CHROMA_OPTIONS.map((option) => ({
                    value: option,
                    label: intl.formatMessage(CHROMA_LABEL_MESSAGE[option]),
                  }))}
                  value={chroma}
                />
              </Field>

              <Field
                id="broadcaster-studio-url"
                label={intl.formatMessage(messages.broadcasterStudioUrlLabel)}
              >
                <Input id="broadcaster-studio-url" readOnly value={overlayUrl} />
              </Field>

              <Button onClick={onCopy} type="button" variant="primary">
                {intl.formatMessage(messages.broadcasterStudioCopyButton)}
              </Button>
            </div>
          </Card>

          <section aria-label={intl.formatMessage(messages.broadcasterStudioResolutionHeading)}>
            <h2>{intl.formatMessage(messages.broadcasterStudioResolutionHeading)}</h2>
            <ul>
              {OBS_RESOLUTION_PRESETS.map((preset) => (
                <li key={preset.id}>
                  {preset.width}×{preset.height} · {preset.fps} FPS
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={intl.formatMessage(messages.broadcasterStudioPreviewLabel)}>
            <h2>{intl.formatMessage(messages.broadcasterStudioPreviewLabel)}</h2>
            <iframe
              className="cl-broadcaster-studio__preview"
              src={overlayUrl}
              title={intl.formatMessage(messages.broadcasterStudioPreviewLabel)}
            />
          </section>
        </>
      ) : null}
    </div>
  );

  return (
    <ListScreenLayout
      listing={listing}
      title={intl.formatMessage(messages.broadcasterStudioTitle)}
    />
  );
}
