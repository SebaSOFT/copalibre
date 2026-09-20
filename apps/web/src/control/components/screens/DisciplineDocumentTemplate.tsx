import { FormattedMessage } from 'react-intl';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { DisciplineSummary } from '../ui/organisms/discipline-summary.js';
import type { DisciplineSummaryData } from '../../lib/discipline-summary.js';
import { messages } from '../../i18n/messages.en.js';

/**
 * An installed discipline's plain-language document detail — the
 * super-admin-only view an installed-modules list action reaches (openspec
 * 0263). Presentation only: the document arrives already fetched.
 */
export function DisciplineDocumentTemplate({
  alias,
  version,
  data,
}: {
  readonly alias: string;
  readonly version: string;
  readonly data: DisciplineSummaryData;
}): React.JSX.Element {
  return (
    <ListScreenLayout
      breadcrumb={
        <span>
          <FormattedMessage {...messages.navPlatformAdministration} /> &gt; {alias}
        </span>
      }
      listing={<DisciplineSummary data={data} />}
      title={`${alias} · ${version}`}
    />
  );
}
