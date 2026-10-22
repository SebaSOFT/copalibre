import { useMemo } from 'react';
import {
  createControlApiClient,
  type ControlApiClient,
  type InstalledDisciplineDocumentResponse,
} from '../../lib/api-client.js';
import type { DisciplineSummaryData } from '../../lib/discipline-summary.js';
import { controlTokenStore } from '../../session/token-store.js';
import { DisciplineDocumentTemplate } from '../screens/DisciplineDocumentTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

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
  const read = useResilientRead<InstalledDisciplineDocumentResponse>(
    `control-discipline-document:${disciplineAlias}`,
    async () => {
      if (!api.fetchInstalledDisciplineDocument) {
        throw new Error('Installed discipline documents are unavailable');
      }
      const document = await api.fetchInstalledDisciplineDocument(disciplineAlias);
      if (!document) throw new Error('Installed discipline document was empty');
      return document;
    },
    { thing: disciplineAlias },
  );

  if (read.data === undefined) return <ReadState {...read} title={disciplineAlias} />;
  return (
    <ReadState {...read} title={disciplineAlias}>
      <DisciplineDocumentTemplate
        alias={read.data.alias}
        data={read.data.document as unknown as DisciplineSummaryData}
        version={read.data.version}
      />
    </ReadState>
  );
}
