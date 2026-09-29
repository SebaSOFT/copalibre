import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type InstalledDisciplineDocumentResponse,
} from '../../lib/api-client.js';
import type { DisciplineSummaryData } from '../../lib/discipline-summary.js';
import { controlTokenStore } from '../../session/token-store.js';
import { DisciplineDocumentTemplate } from '../screens/DisciplineDocumentTemplate.js';
import { messages } from '../../i18n/messages.en.js';

export function DisciplineDocumentPage({
  disciplineAlias,
  client,
}: {
  readonly disciplineAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [document_, setDocument] = useState<InstalledDisciplineDocumentResponse | undefined>(
    undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .fetchInstalledDisciplineDocument?.(disciplineAlias)
      .then((loaded) => {
        if (live) setDocument(loaded);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [api, disciplineAlias]);

  if (failed) {
    return (
      <Alert tone="destructive">
        <FormattedMessage {...messages.disciplineDocumentLoadFailed} />
      </Alert>
    );
  }
  if (document_ === undefined) {
    return (
      <Alert tone="info">
        <FormattedMessage {...messages.disciplineDocumentLoading} />
      </Alert>
    );
  }

  return (
    <DisciplineDocumentTemplate
      alias={document_.alias}
      data={document_.document as unknown as DisciplineSummaryData}
      version={document_.version}
    />
  );
}
