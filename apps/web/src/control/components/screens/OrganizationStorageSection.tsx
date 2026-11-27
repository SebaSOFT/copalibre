import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  type OrganizationStorageUsageResponse,
  type UnreferencedObjectResponse,
} from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { ConsequenceDialog } from '../ui/organisms/consequence-dialog.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import { formatStorageBytes } from '../pages/PreferencesPage.js';
import { whoCan } from './preferences-permissions.js';

export function OrganizationStorageSection({
  canManage,
  onDeleteUnreferencedObject,
  organizationAlias,
  storageError,
  storageLoading,
  storageUsage,
  unreferencedObjects,
}: {
  readonly canManage: boolean;
  readonly onDeleteUnreferencedObject: (objectId: string) => Promise<void>;
  readonly organizationAlias: string | undefined;
  readonly storageError: string | undefined;
  readonly storageLoading: boolean;
  readonly storageUsage: OrganizationStorageUsageResponse | undefined;
  readonly unreferencedObjects: readonly UnreferencedObjectResponse[];
}): React.JSX.Element | null {
  const intl = useIntl();
  const [pendingDelete, setPendingDelete] = useState<UnreferencedObjectResponse | undefined>(
    undefined,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  if (organizationAlias === undefined) return null;

  if (!canManage) {
    return (
      <Card
        aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
        className="cl-chamfer cl-chamfer--control cl-preferences-panel"
      >
        <h2>
          <FormattedMessage {...controlMessages.storageUsageHeading} />
        </h2>
        <p>
          <FormattedMessage {...controlMessages.storageUsageDescription} />
        </p>
        <p>
          {intl.formatMessage(
            controlMessages.orgSectionWithheld,
            whoCan(intl, 'org.manage-settings'),
          )}
        </p>
      </Card>
    );
  }

  const describeObject = (object: UnreferencedObjectResponse): Record<string, string> => ({
    contentType: object.contentType,
    size: formatStorageBytes(object.sizeBytes),
    date: new Date(object.createdAt).toLocaleDateString(intl.locale),
  });

  async function confirmDelete(): Promise<void> {
    if (pendingDelete === undefined) return;
    setDeleteBusy(true);
    try {
      await onDeleteUnreferencedObject(pendingDelete.objectId);
      setPendingDelete(undefined);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card
      aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.storageUsageHeading} />
      </h2>
      <p>
        <FormattedMessage {...controlMessages.storageUsageDescription} />
      </p>

      {storageLoading ? (
        <p>
          <FormattedMessage {...controlMessages.storageUsageLoading} />
        </p>
      ) : storageError ? (
        <Alert tone="destructive">{storageError}</Alert>
      ) : storageUsage !== undefined ? (
        <p className="cl-preferences-storage-summary">
          <FormattedMessage
            {...controlMessages.storageUsageSummary}
            values={{
              formattedBytes: formatStorageBytes(storageUsage.totalBytes),
              objectCount: storageUsage.objectCount,
            }}
          />
        </p>
      ) : null}

      {unreferencedObjects.length > 0 && (
        <Stack gap="2">
          <h3>
            <FormattedMessage {...controlMessages.storageUsageUnreferencedHeading} />
          </h3>
          <ul
            aria-label={intl.formatMessage(controlMessages.storageUsageUnreferencedHeading)}
            className="cl-preferences-unreferenced"
          >
            {unreferencedObjects.map((object) => (
              <li key={object.objectId} className="cl-role-user">
                <span className="cl-label">
                  {intl.formatMessage(
                    controlMessages.storageUsageObjectMeta,
                    describeObject(object),
                  )}
                </span>
                <Button
                  aria-label={intl.formatMessage(
                    controlMessages.storageUsageDeleteObjectLabel,
                    describeObject(object),
                  )}
                  onClick={() => setPendingDelete(object)}
                  type="button"
                  variant="destructive-outline"
                >
                  <FormattedMessage {...controlMessages.storageUsageDeleteObject} />
                </Button>
              </li>
            ))}
          </ul>
        </Stack>
      )}

      <ConsequenceDialog
        busy={deleteBusy}
        cancelLabel={intl.formatMessage(controlMessages.statisticsRebuildCancel)}
        closeLabel={intl.formatMessage(controlMessages.registrationModalClose)}
        confirmLabel={intl.formatMessage(controlMessages.storageUsageDeleteObject)}
        counts={[]}
        description={intl.formatMessage(
          controlMessages.storageUsageDeleteDescription,
          pendingDelete === undefined ? {} : describeObject(pendingDelete),
        )}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setPendingDelete(undefined);
        }}
        open={pendingDelete !== undefined}
        title={intl.formatMessage(controlMessages.storageUsageDeleteTitle)}
      />
    </Card>
  );
}
