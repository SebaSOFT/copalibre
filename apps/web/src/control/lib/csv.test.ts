import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes the header and one line per row, ending with a newline', () => {
    expect(
      toCsv(
        ['Tournament', 'Live matches'],
        [
          ['Copa Premier', 2],
          ['Copa Apertura', 0],
        ],
      ),
    ).toBe('Tournament,Live matches\nCopa Premier,2\nCopa Apertura,0\n');
  });

  it('leaves an absent cell empty, so a missing count is not a zero', () => {
    expect(toCsv(['Tournament', 'Live matches'], [['Copa Premier', undefined]])).toBe(
      'Tournament,Live matches\nCopa Premier,\n',
    );
  });

  it('quotes a cell with a comma, a quote or a line break, doubling quotes', () => {
    expect(toCsv(['Name'], [['Liga "A", Norte'], ['Dos\nlíneas']])).toBe(
      'Name\n"Liga ""A"", Norte"\n"Dos\nlíneas"\n',
    );
  });

  it('neutralizes a text cell a spreadsheet would read as a formula', () => {
    expect(toCsv(['Name'], [['=HYPERLINK("x")'], ['+1'], ['-1'], ['@SUM(A1)']])).toBe(
      'Name\n"\'=HYPERLINK(""x"")"\n\'+1\n\'-1\n\'@SUM(A1)\n',
    );
  });

  it('keeps a negative number a number', () => {
    expect(toCsv(['Delta'], [[-3]])).toBe('Delta\n-3\n');
  });
});
