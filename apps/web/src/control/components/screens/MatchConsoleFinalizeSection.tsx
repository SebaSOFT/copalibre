import type { Dispatch, SetStateAction } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { MatchConsoleResponse } from '../../lib/api-client.js';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Label } from '../ui/atoms/label.js';
import { RadioGroup, RadioGroupItem } from '../ui/atoms/radio.js';
import { EntrantName } from '../../../components/ui/atoms/EntrantName.js';
import { FieldSet } from '../ui/molecules/field-set.js';
import { messages } from '../../i18n/messages.en.js';
import { variantOf } from './match-console-model.js';

/**
 * Radix's `RadioGroup` treats an empty string value as "nothing selected,"
 * so the "no winner" option needs a real, non-empty sentinel — mapped back
 * to `''` (the actual unset state `finalizeWinner` carries) on change.
 */
const FINALIZE_NO_WINNER_VALUE = '__no-winner__';

export interface MatchConsoleFinalizeSectionProps {
  readonly canFinalize: boolean;
  readonly confirmingFinalize: boolean;
  readonly entrantById: ReadonlyMap<string, MatchConsoleResponse['entrants'][number]>;
  readonly finalizePrimary: boolean;
  readonly finalizeWinner: string;
  readonly finalizing: boolean;
  readonly handleCancelFinalize: () => void;
  readonly handleConfirmFinalize: () => Promise<void>;
  readonly projection: MatchConsoleResponse;
  readonly setConfirmingFinalize: Dispatch<SetStateAction<boolean>>;
  readonly setFinalizeWinner: Dispatch<SetStateAction<string>>;
}

/** The finalize card: a start button, then the immutable-result confirmation with its winner choice. */
export function MatchConsoleFinalizeSection({
  canFinalize,
  confirmingFinalize,
  entrantById,
  finalizePrimary,
  finalizeWinner,
  finalizing,
  handleCancelFinalize,
  handleConfirmFinalize,
  projection,
  setConfirmingFinalize,
  setFinalizeWinner,
}: MatchConsoleFinalizeSectionProps): React.JSX.Element {
  const intl = useIntl();

  return (
    <Card className="cl-chamfer cl-chamfer--control">
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.matchConsoleFinalize} />
        </h2>
      </header>
      <div className="cl-card__content">
        {!confirmingFinalize ? (
          <Button
            disabled={!canFinalize || projection.status !== 'in-progress'}
            onClick={() => setConfirmingFinalize(true)}
            type="button"
            variant={variantOf(finalizePrimary)}
          >
            <FormattedMessage {...messages.matchConsoleFinalizeMatch} />
          </Button>
        ) : (
          <Alert
            block
            dismissLabel={intl.formatMessage(messages.toastDismiss)}
            onDismiss={handleCancelFinalize}
            tone="warning"
          >
            <strong>
              <FormattedMessage {...messages.matchConsoleFinalizeImmutable} />
            </strong>
            <span>
              <FormattedMessage {...messages.matchConsoleFinalizeCorrections} />
            </span>
            <FieldSet legend={intl.formatMessage(messages.matchConsoleFinalizeWinnerLegend)}>
              <RadioGroup
                name="finalize-winner"
                onValueChange={(value) =>
                  setFinalizeWinner(value === FINALIZE_NO_WINNER_VALUE ? '' : value)
                }
                value={finalizeWinner || FINALIZE_NO_WINNER_VALUE}
              >
                {projection.liveScores.map((side) => {
                  const entrant = entrantById.get(side.entrantId);
                  const fieldId = `finalize-winner-${side.entrantId}`;
                  return (
                    <Label
                      className="cl-toggle cl-focusable"
                      htmlFor={fieldId}
                      key={side.entrantId}
                    >
                      <RadioGroupItem id={fieldId} value={side.entrantId} />
                      <EntrantName
                        {...(entrant?.abbreviation === undefined
                          ? {}
                          : { abbreviation: entrant.abbreviation })}
                        fullName={
                          entrant?.name ?? intl.formatMessage(messages.matchConsoleUnnamedEntrant)
                        }
                      />
                      <strong>{side.score}</strong>
                    </Label>
                  );
                })}
                <Label className="cl-toggle cl-focusable" htmlFor="finalize-winner-none">
                  <RadioGroupItem id="finalize-winner-none" value={FINALIZE_NO_WINNER_VALUE} />
                  <span>
                    <FormattedMessage {...messages.matchConsoleFinalizeNoWinner} />
                  </span>
                </Label>
              </RadioGroup>
            </FieldSet>
            <div className="cl-role-user">
              <Button onClick={handleCancelFinalize} type="button" variant="secondary">
                <FormattedMessage {...messages.matchConsoleCancel} />
              </Button>
              <Button
                disabled={finalizing}
                onClick={() => void handleConfirmFinalize()}
                type="button"
                variant="primary"
              >
                <FormattedMessage {...messages.matchConsoleConfirmFinalization} />
              </Button>
            </div>
          </Alert>
        )}
      </div>
    </Card>
  );
}
