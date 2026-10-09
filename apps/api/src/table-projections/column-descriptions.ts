import type {
  DisciplineDescriptor,
  LocalizedLabel,
  TableColumnDefinition,
  TableLayoutDefinition,
} from '@copalibre/domain';

type Label = string | LocalizedLabel;

/**
 * The full wording behind an abbreviated column header.
 *
 * A layout's `header` is often only the abbreviation (`PJ`, `PG`), and the
 * descriptor already names what it counts: a `collector` column points at a
 * statistic or collector with a localized `label`, and a `computed` column
 * is an expression over other columns. Both are the discipline's own data, so
 * the platform never carries a glossary of sporting terms of its own.
 */
export function describeColumns(
  layout: TableLayoutDefinition,
  descriptor: Pick<DisciplineDescriptor, 'statistics' | 'collectors'>,
): Readonly<Record<string, Label>> {
  const labelByCode = new Map<string, Label>();
  for (const one of descriptor.collectors ?? []) labelByCode.set(one.code, one.label);
  for (const one of descriptor.statistics) labelByCode.set(one.code, one.label);

  const described: Record<string, Label> = {};
  for (const column of layout.columns) {
    const label = describeColumn(column, layout, labelByCode);
    if (label !== undefined) described[column.code] = label;
  }
  return described;
}

function describeColumn(
  column: TableColumnDefinition,
  layout: TableLayoutDefinition,
  labelByCode: ReadonlyMap<string, Label>,
): Label | undefined {
  if (column.source.kind === 'collector') return labelByCode.get(column.source.code);
  if (column.source.kind === 'computed')
    return describeExpression(column.source.expression, layout);
  return undefined;
}

/**
 * `gf - ga` over columns headed `GF` and `GC` reads `GF − GC`: each column
 * code in the expression is replaced by that column's own header, per locale.
 * An expression naming no column of the layout has nothing to say in words,
 * so it yields no description.
 */
function describeExpression(expression: string, layout: TableLayoutDefinition): Label | undefined {
  const codes = layout.columns.map((one) => one.code).sort((a, b) => b.length - a.length);
  const referenced = codes.filter((code) =>
    new RegExp(`(?<![\\w-])${code}(?![\\w-])`).test(expression),
  );
  if (referenced.length === 0) return undefined;

  const render = (language: string): string => {
    let text = expression;
    for (const code of referenced) {
      const column = layout.columns.find((one) => one.code === code);
      if (column === undefined) continue;
      const header = headerIn(column.shortHeader ?? column.header, language);
      text = text.replace(new RegExp(`(?<![\\w-])${code}(?![\\w-])`, 'g'), header);
    }
    return text.replace(/ - /g, ' − ');
  };

  const languages = new Set<string>(['en']);
  for (const code of referenced) {
    const column = layout.columns.find((one) => one.code === code);
    const header = column?.shortHeader ?? column?.header;
    for (const key of Object.keys(typeof header === 'string' ? {} : (header ?? {})))
      languages.add(key);
  }
  const label: Record<string, string> = {};
  for (const language of languages) label[language] = render(language);
  return label as unknown as LocalizedLabel;
}

function headerIn(label: Label, language: string): string {
  if (typeof label === 'string') return label;
  return (label as unknown as Record<string, string | undefined>)[language] ?? label.en;
}
