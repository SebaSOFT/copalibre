import { useEffect, useState } from 'react';
import type { ControlApiClient, StageResponse } from '../../lib/api-client.js';

/**
 * The name the organizer gave a stage, for the breadcrumb of every page under
 * it. `undefined` until the stage list arrives, when it fails, or when the
 * stage has no name; the page then shows the numbered fallback. A failed read
 * stays silent on purpose: the crumb is a label, and the page's own reads
 * already tell the operator when the stage cannot be loaded.
 */
export function useStageName(
  api: ControlApiClient,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
): string | undefined {
  const key = `${organizationAlias}:${tournamentAlias}:${stageNumber}`;
  const [found, setFound] = useState<{ readonly key: string; readonly name: string }>();
  useEffect(() => {
    let cancelled = false;
    void new Promise<readonly StageResponse[] | undefined>((resolve) =>
      resolve(api.listStages?.(organizationAlias, tournamentAlias)),
    )
      .then((stages) => stages?.find((candidate) => candidate.number === stageNumber)?.name)
      .then((name) => {
        if (!cancelled && name?.trim()) setFound({ key, name: name.trim() });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, key, organizationAlias, tournamentAlias, stageNumber]);
  return found?.key === key ? found.name : undefined;
}
