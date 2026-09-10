import {
  COLOR_PRIMITIVES,
  FONT_SIZE,
  FONT_WEIGHTS,
  RADIUS,
  SPACING,
  TRACKING,
  TYPOGRAPHY,
} from './primitives.js';

type Mapping = { [key: string]: string | Mapping };

/** DESIGN.md roles project the three source stacks into their established uses. */
export function documentedTokens(): Mapping {
  const role = (
    fontFamily: string,
    fontSize: string,
    fontWeight: string,
    lineHeight: string,
    letterSpacing: string,
  ) => ({ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing });
  return {
    colors: { ...COLOR_PRIMITIVES },
    typography: {
      display: role(TYPOGRAPHY.display, FONT_SIZE['3xl'], FONT_WEIGHTS.bold, '1.1', TRACKING.wide),
      headline: role(TYPOGRAPHY.display, FONT_SIZE.xl, FONT_WEIGHTS.semibold, '1.2', TRACKING.wide),
      title: role(TYPOGRAPHY.display, FONT_SIZE.lg, FONT_WEIGHTS.semibold, '1.3', TRACKING.wide),
      body: role(TYPOGRAPHY.body, FONT_SIZE.base, FONT_WEIGHTS.regular, '1.5', TRACKING.normal),
      label: role(TYPOGRAPHY.mono, FONT_SIZE.xs, FONT_WEIGHTS.medium, '1.4', TRACKING.wider),
      figure: {
        ...role(TYPOGRAPHY.mono, FONT_SIZE.lg, FONT_WEIGHTS.medium, '1.2', TRACKING.normal),
        fontFeature: 'tabular-nums',
      },
    },
    rounded: { ...RADIUS },
    spacing: { ...SPACING },
  };
}

function frontmatter(document: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(document);
  if (!match || match[1] === undefined) throw new Error('DESIGN.md: missing or unclosed frontmatter');
  return match[1];
}

function scalar(raw: string): string {
  if (/^"(?:[^"\\]|\\.)*"$/.test(raw)) return JSON.parse(raw) as string;
  if (/^'(?:[^']|'')*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  throw new Error(`unsupported scalar ${raw}`);
}

/** Only the generated mapping/scalar subset is accepted; never skip an unknown line. */
export function readDesignTokens(document: string): Mapping {
  const root: Mapping = {};
  const stack: Mapping[] = [root];
  for (const [index, line] of frontmatter(document).split(/\r?\n/).entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = /^( *)([\w-]+|"[\w-]+"|'[\w-]+'):(?: (.*))?$/.exec(line);
    if (!match || match[1] === undefined || match[2] === undefined || match[1].length % 2 !== 0)
      throw new Error(`DESIGN.md:${index + 2}: unsupported mapping`);
    const depth = match[1].length / 2;
    const parent = stack[depth];
    if (!parent || depth > 2) throw new Error(`DESIGN.md:${index + 2}: invalid nesting`);
    const key = match[2].replace(/^['"]|['"]$/g, '');
    if (Object.hasOwn(parent, key)) throw new Error(`DESIGN.md:${index + 2}: duplicate ${key}`);
    const value = match[3];
    stack.length = depth + 1;
    if (value === undefined) {
      const child: Mapping = {};
      parent[key] = child;
      stack.push(child);
    } else if (depth === 0 && (key === 'name' || key === 'description')) {
      // These generated prose scalars are unquoted and never used as token values.
      parent[key] = value;
    } else {
      parent[key] = scalar(value);
    }
  }
  for (const key of Object.keys(root)) {
    if (
      !['name', 'description', 'colors', 'typography', 'rounded', 'spacing', 'components'].includes(
        key,
      )
    ) {
      throw new Error(`DESIGN.md: unsupported group ${key}`);
    }
  }
  return Object.fromEntries(
    Object.entries(root).filter(([key]) =>
      ['colors', 'typography', 'rounded', 'spacing'].includes(key),
    ),
  );
}

export function designTokenDifferences(
  actual: Mapping,
  expected: Mapping = documentedTokens(),
  path = '',
): string[] {
  const differences: string[] = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const name = path ? `${path}.${key}` : key;
    const wanted = expected[key];
    const found = actual[key];
    if (found === undefined) differences.push(`${name}: missing from DESIGN.md`);
    else if (wanted === undefined) differences.push(`${name}: absent from token source`);
    else if (typeof wanted === 'object' && typeof found === 'object')
      differences.push(...designTokenDifferences(found, wanted, name));
    else if (wanted !== found)
      differences.push(
        `${name}: documented ${JSON.stringify(found)}, source ${JSON.stringify(wanted)}`,
      );
  }
  return differences;
}

/** Refresh only verified groups. Preserve narrative, component metadata and normative note. */
export function refreshDesignTokens(document: string): string {
  readDesignTokens(document);
  let block = frontmatter(document);
  const render = (mapping: Mapping, depth: number): string =>
    Object.entries(mapping)
      .map(
        ([key, value]) =>
          `${'  '.repeat(depth)}${/^\d+$/.test(key) ? JSON.stringify(key) : key}:${typeof value === 'object' ? `\n${render(value, depth + 1)}` : ` ${JSON.stringify(value)}`}`,
      )
      .join('\n');
  for (const [key, value] of Object.entries(documentedTokens())) {
    if (value === undefined) continue;
    const section = new RegExp(`^${key}:\\r?\\n(?:[ \\t].*(?:\\r?\\n|$)|\\r?\\n)*`, 'm');
    const rendered = render({ [key]: value }, 0) + '\n';
    block = section.test(block) ? block.replace(section, rendered) : block + '\n' + rendered;
  }
  return document.replace(frontmatter(document), block.trimEnd());
}
