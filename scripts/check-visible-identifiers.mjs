/**
 * Inspect rendered browser content for identifiers that have no place in a person-facing view.
 * `scanVisibleIdentifiers` is intentionally browser-native so Playwright can serialize it into
 * the page that it is checking instead of approximating visibility from source HTML.
 */
export function scanVisibleIdentifiers(knownAliases, root = globalThis.document.body) {
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const shortIdPattern = /\b[0-9a-f]{8}\b/gi;
  const matchCodePattern = /\b(?:SE|WB|LB|GF|PL\d+)-R\d+-M\d+(?:-G\d+)?\b/g;
  const aliases = knownAliases
    .filter((alias) => typeof alias === 'string' && alias.trim().length > 0)
    .map((value) => ({ value: value.trim(), normalized: value.trim().toLocaleLowerCase() }));

  const visibleTextOf = (element) => {
    if (element.tagName === 'INPUT')
      return element.getAttribute('type')?.toLowerCase() === 'password' ? '' : element.value;
    if (element.tagName === 'TEXTAREA') return element.value;
    if (element.tagName === 'SELECT') return element.selectedOptions[0]?.label ?? '';
    return element.innerText ?? element.textContent ?? '';
  };
  const isVisible = (element) => {
    if (element.closest('script, style, noscript, template, [hidden], [aria-hidden="true"]')) {
      return false;
    }
    const style = globalThis.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      style.opacity !== '0' &&
      element.getClientRects().length > 0
    );
  };
  const isNameSlot = (element) => {
    for (let current = element; current && current !== root; current = current.parentElement) {
      const hint = [
        current.getAttribute('class'),
        current.getAttribute('data-slot'),
        current.getAttribute('data-field'),
        current.getAttribute('data-testid'),
        current.getAttribute('aria-label'),
      ]
        .filter(Boolean)
        .join(' ');
      if (
        /(^|[-_\s])(name|identity|entrant|club|team|member|person|player)([-_\s]|$)/i.test(hint)
      ) {
        return true;
      }

      const cell = current.closest('td, th');
      const table = cell?.closest('table');
      const header = cell && table?.tHead?.rows[0]?.cells[cell.cellIndex]?.textContent;
      if (header && /name|entrant|club|team|member|person|player/i.test(header)) return true;
    }
    return false;
  };
  const describeElement = (element) => {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList]
      .slice(0, 2)
      .map((className) => `.${className}`)
      .join('');
    const testId = element.getAttribute('data-testid');
    return `${tag}${id}${classes}${testId ? `[data-testid="${testId}"]` : ''}`;
  };

  const elements = [root, ...root.querySelectorAll('*')].filter(isVisible);
  const visibleTextByElement = new Map(
    elements.map((element) => [element, visibleTextOf(element)]),
  );
  const violations = [];
  const reported = new Set();

  for (const element of elements) {
    const text = (visibleTextByElement.get(element) ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const candidates = [];
    for (const match of text.matchAll(uuidPattern))
      candidates.push({ reason: 'uuid', value: match[0] });
    for (const match of text.matchAll(matchCodePattern))
      candidates.push({ reason: 'internal match code', value: match[0] });
    if (isNameSlot(element)) {
      for (const match of text.matchAll(shortIdPattern)) {
        candidates.push({ reason: '8-character identifier in a name slot', value: match[0] });
      }
    }
    for (const alias of aliases) {
      const normalizedText = text.toLocaleLowerCase();
      let index = normalizedText.indexOf(alias.normalized);
      while (index >= 0) {
        const before = text[index - 1] ?? '';
        const after = text[index + alias.value.length] ?? '';
        const isWordCharacter = (value) => value !== '' && /[\p{L}\p{N}]/u.test(value);
        if (!isWordCharacter(before) && !isWordCharacter(after)) {
          candidates.push({
            reason: `known alias "${alias.value}"`,
            value: text.slice(index, index + alias.value.length),
          });
          break;
        }
        index = normalizedText.indexOf(alias.normalized, index + alias.normalized.length);
      }
    }

    for (const candidate of candidates) {
      const childContainsValue = [...element.children].some((child) => {
        if (!isVisible(child)) return false;
        return (visibleTextByElement.get(child) ?? visibleTextOf(child)).includes(candidate.value);
      });
      if (childContainsValue) continue;

      const key = `${candidate.reason}\u0000${candidate.value}\u0000${describeElement(element)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      violations.push({
        route: globalThis.location.pathname,
        element: describeElement(element),
        reason: candidate.reason,
        text,
      });
    }
  }

  return violations;
}

export function formatVisibleIdentifierViolations(violations) {
  return violations
    .map(({ route, element, reason, text }) => `${route} ${element}: ${reason} in "${text}"`)
    .join('\n');
}
