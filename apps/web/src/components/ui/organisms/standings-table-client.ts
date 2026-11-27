import type { PlayerStatisticsDrilldownResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import {
  buildPlayerDialogContent,
  extractDialogTournamentTotals,
  playerDialogMessage,
  type PlayerDialogLabels,
  type PlayerDialogProfile,
} from '../../../lib/player-dialog-content.ts';
import { matchesPlayerQuery } from '../../../lib/player-search.ts';

function initTableSorting(root: ParentNode = document) {
  root.querySelectorAll<HTMLTableElement>('[data-sortable-table]').forEach((table) => {
    const body = table.tBodies.item(0);
    if (!body) return;

    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    const initialSortedHeader = headers.find((header) => {
      const state = header.getAttribute('aria-sort');
      return state === 'ascending' || state === 'descending';
    });
    let activeColumn: string | undefined = initialSortedHeader?.querySelector<HTMLButtonElement>(
      '[data-table-sort-button]',
    )?.dataset.columnCode;
    let direction: 'ascending' | 'descending' =
      initialSortedHeader?.getAttribute('aria-sort') === 'descending' ? 'descending' : 'ascending';
    const announcement = table.parentElement?.querySelector<HTMLElement>(
      '[data-table-sort-announcement]',
    );
    const ascLabel = table.dataset.sortedAscLabel ?? 'Sorted ascending';
    const descLabel = table.dataset.sortedDescLabel ?? 'Sorted descending';

    for (const button of table.querySelectorAll<HTMLButtonElement>('[data-table-sort-button]')) {
      button.addEventListener('click', () => {
        const columnCode = button.dataset.columnCode;
        if (!columnCode) return;
        direction =
          activeColumn === columnCode && direction === 'ascending' ? 'descending' : 'ascending';
        activeColumn = columnCode;

        const columnIndex = headers.findIndex(
          (header) =>
            header.querySelector<HTMLButtonElement>('[data-table-sort-button]')?.dataset
              .columnCode === columnCode,
        );
        if (columnIndex < 0) return;

        const rows = Array.from(body.rows);
        rows.sort((left, right) => {
          const leftCell = left.cells.item(columnIndex);
          const rightCell = right.cells.item(columnIndex);
          const leftMissing = leftCell?.dataset.sortMissing === 'true';
          const rightMissing = rightCell?.dataset.sortMissing === 'true';
          if (leftMissing && rightMissing) return 0;
          if (leftMissing) return 1;
          if (rightMissing) return -1;

          const leftValue = leftCell?.dataset.sortValue ?? '';
          const rightValue = rightCell?.dataset.sortValue ?? '';
          const numeric =
            leftCell?.dataset.sortType === 'number' && rightCell?.dataset.sortType === 'number';
          const comparison = numeric
            ? Number(leftValue) - Number(rightValue)
            : leftValue.localeCompare(rightValue);
          return direction === 'ascending' ? comparison : -comparison;
        });
        body.append(...rows);

        headers.forEach((header, index) => {
          if (header.hasAttribute('aria-sort')) {
            header.setAttribute('aria-sort', index === columnIndex ? direction : 'none');
          }
        });
        if (announcement) {
          const columnLabel = button.textContent?.trim() || columnCode;
          announcement.textContent = `${columnLabel}: ${direction === 'ascending' ? ascLabel : descLabel}`;
        }
      });
    }
  });
}

function applyClientSearch(section: ParentNode, query: string): void {
  const table = section.querySelector<HTMLTableElement>('table[data-sortable-table]');
  const body = table?.tBodies.item(0);
  if (!body) return;
  let visible = 0;
  for (const row of Array.from(body.rows)) {
    const name = row.dataset.playerName ?? '';
    const matched = matchesPlayerQuery(name, query);
    row.hidden = !matched;
    if (matched) visible += 1;
  }
  const emptyNote = section.querySelector<HTMLElement>('[data-standings-empty]');
  if (emptyNote) emptyNote.hidden = visible > 0;
}

function updateQueryParam(query: string): void {
  const nextUrl = new URL(window.location.href);
  const trimmed = query.trim();
  if (trimmed.length > 0) nextUrl.searchParams.set('q', trimmed);
  else nextUrl.searchParams.delete('q');
  history.replaceState(history.state, '', nextUrl);
}

function initTableSearch(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>('[data-table-search-form]').forEach((form) => {
    const input = form.querySelector<HTMLInputElement>('[data-table-search-input]');
    const section = form.closest<HTMLElement>('.cl-standings-section') ?? root;
    if (!input) return;

    let searchController: AbortController | undefined;

    const handleSearchUpdate = async (): Promise<void> => {
      if (form.dataset.serverFiltered === 'true') {
        const url = new URL(form.action, window.location.origin);
        form.querySelectorAll<HTMLInputElement>('input[type="hidden"]').forEach((hidden) => {
          if (hidden.name && hidden.value) url.searchParams.set(hidden.name, hidden.value);
        });
        searchController?.abort();
        searchController = new AbortController();
        try {
          const response = await fetch(url.toString(), {
            signal: searchController.signal,
            headers: { accept: 'text/html' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
          const nextContainer = parsed.querySelector('.cl-standings-section .cl-table-container');
          const currentContainer = section.querySelector('.cl-table-container');
          if (nextContainer && currentContainer) {
            currentContainer.replaceWith(document.importNode(nextContainer, true));
            form.dataset.serverFiltered = 'false';
            initTableSorting(section);
            initPlayerDialog(section);
          }
        } catch {
          // A superseded search (aborted) or a failed one keeps the table as it is.
          return;
        }
      }
      applyClientSearch(section, input.value);
      updateQueryParam(input.value);
    };

    input.addEventListener('input', () => {
      void handleSearchUpdate();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleSearchUpdate();
    });
  });
}

function readPlayerDialogLabels(root: ParentNode): PlayerDialogLabels {
  const fallback: PlayerDialogLabels = {
    locale: 'en',
    roles: {},
    fallbackTitle: 'Player Profile',
    loadingPlaceholder: 'Loading player details...',
    loadingFetch: 'Loading...',
    careerStatisticsHeading: 'Career Statistics',
    competitionHistoryHeading: 'Competition History',
    columnTournament: 'Tournament',
    columnTeam: 'Team',
    columnRole: 'Role',
    noCareerStatistics: 'No career statistics recorded.',
    noCompetitionHistory: 'No competition history recorded.',
    loadError: 'Unable to load player details.',
  };
  const payload = root.querySelector('[data-player-dialog-labels]');
  if (!payload?.textContent) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(payload.textContent) as Partial<PlayerDialogLabels>) };
  } catch {
    return fallback;
  }
}

function initPlayerDialog(root: ParentNode = document) {
  const dialog = root.querySelector<HTMLDialogElement>('#cl-player-dialog');
  if (!dialog) return;

  const labels = readPlayerDialogLabels(root);
  const body = dialog.querySelector('#cl-player-dialog-body');
  const title = dialog.querySelector('#cl-player-dialog-title');
  const closeBtn = dialog.querySelector('[data-close-dialog]');

  if (dialog.dataset.dialogBound !== 'true') {
    dialog.dataset.dialogBound = 'true';
    closeBtn?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  root.querySelectorAll<HTMLAnchorElement>('.cl-player-link').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const profileUrl = link.dataset.profileUrl || link.href;
      const profileHref = link.dataset.profileHref || link.href;
      const statisticsUrl = link.dataset.statisticsUrl;
      const tournamentAlias = link.dataset.tournamentAlias;
      body?.replaceChildren(
        playerDialogMessage(document, 'cl-player-dialog__loading', labels.loadingFetch),
      );
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      }

      try {
        const [profileRes, statsRes] = await Promise.all([
          fetch(profileUrl),
          statisticsUrl ? fetch(statisticsUrl).catch(() => undefined) : Promise.resolve(undefined),
        ]);
        if (!profileRes.ok) throw new Error(`HTTP ${profileRes.status}`);
        const data = (await profileRes.json()) as PlayerDialogProfile;
        let statsData: PlayerStatisticsDrilldownResponse | undefined;
        if (statsRes?.ok) {
          statsData = (await statsRes.json()) as PlayerStatisticsDrilldownResponse;
        }
        const tournamentTotals = extractDialogTournamentTotals(statsData, labels.locale, 2);
        if (title) title.textContent = data.displayName || labels.fallbackTitle;
        body?.replaceChildren(
          buildPlayerDialogContent(document, data, labels, {
            ...(tournamentAlias === undefined ? {} : { tournamentAlias }),
            profileHref,
            tournamentTotals,
          }),
        );
      } catch {
        body?.replaceChildren(playerDialogMessage(document, 'cl-inline-alert', labels.loadError));
      }
    });
  });
}

/*
  A tab or a club chip changes the table, not the page: the choice is fetched as the
  same server-rendered page, the standings section is swapped in place, and the query
  string is recorded with `replaceState`. The scroll position and the focused control
  survive the swap. Without this script every control is still a link to the same page
  in that state, and a failed fetch falls back to following it.
*/
const CONTROL = 'a.cl-table-tab, a[data-club-filter]';
let pending: AbortController | undefined;

function controlKey(control: Element): string {
  return control.matches('.cl-table-tab')
    ? `tab:${control.getAttribute('data-layout-code') ?? ''}`
    : `club:${control.getAttribute('data-club-filter') ?? ''}`;
}

async function swapStandings(link: HTMLAnchorElement): Promise<void> {
  const section = link.closest<HTMLElement>('.cl-standings-section');
  if (!section) return;
  const sections = Array.from(document.querySelectorAll('.cl-standings-section'));
  const index = sections.indexOf(section);
  const key = controlKey(link);
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  pending?.abort();
  pending = new AbortController();
  section.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(link.href, {
      signal: pending.signal,
      headers: { accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = parsed.querySelectorAll('.cl-standings-section').item(index);
    if (!next) throw new Error('no standings section');

    const fresh = document.importNode(next, true) as HTMLElement;
    section.replaceWith(fresh);
    history.replaceState(history.state, '', link.href);
    initTableSorting(fresh);
    initTableSearch(fresh);
    initPlayerDialog(fresh);
    window.scrollTo(scrollX, scrollY);
    const same = Array.from(fresh.querySelectorAll<HTMLElement>(CONTROL)).find(
      (control) => controlKey(control) === key,
    );
    same?.focus({ preventScroll: true });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') return;
    section.removeAttribute('aria-busy');
    window.location.href = link.href;
  }
}

function initStandingsControls() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(CONTROL);
    if (!link || !link.closest('.cl-standings-section')) return;
    event.preventDefault();
    void swapStandings(link);
  });
}

function init() {
  initTableSorting();
  initTableSearch();
  initPlayerDialog();
  initStandingsControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
