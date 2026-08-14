/**
 * Turning a table on a screen into a file that opens in a spreadsheet.
 *
 * "Export" in a dental practice means one thing: the row lands in Excel, in
 * columns, on the first double-click. Everything here is in service of that,
 * and each of the three oddities below is a place where the obvious CSV gets it
 * wrong on the machines this app actually runs on.
 */

/**
 * Semicolons, not commas.
 *
 * Excel does not parse `.csv` with a fixed separator — it uses the *system list
 * separator*, which on an Albanian or Italian Windows is `;`, because the comma
 * is already the decimal point. A comma-separated file double-clicked on the
 * clinic's own machine lands every column in cell A1.
 */
export const CSV_DELIMITER = ';';

/**
 * Excel reads this first line and takes the separator from it instead of from
 * the system, which is what makes the same file open correctly on a machine set
 * to English as well. LibreOffice honours it too. It costs a line of noise in
 * anything that does not — which is the right way round, because the spreadsheet
 * is the destination and a text editor is not.
 */
const SEPARATOR_HINT = `sep=${CSV_DELIMITER}`;

/**
 * Prepended so Excel reads the file as UTF-8 rather than as the local codepage.
 * Without it every ë, ç and ü in an Albanian name arrives as mojibake — which is
 * most names.
 */
export const CSV_BOM = '\uFEFF';

/** Leading characters Excel treats as the start of a formula rather than as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell, quoted exactly as much as it needs to be.
 *
 * The formula guard is not theatre: a phone number is written `+355 69 …` in
 * this country, and Excel reads a leading `+` as arithmetic and shows `#NAME?`
 * where the number should be. A leading apostrophe is the spreadsheet's own
 * "this is text" marker and is not displayed in the cell.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;

  // Newlines are quoted rather than stripped: a works row carries its lines
  // stacked inside one cell, and that is the shape the register is read in.
  if (/["\r\n]/.test(text) || text.includes(CSV_DELIMITER)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * A whole file: the separator hint, then one line per row. CRLF throughout,
 * per RFC 4180 and per what Excel expects.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return [SEPARATOR_HINT, ...rows.map((row) => row.map(csvCell).join(CSV_DELIMITER))].join('\r\n');
}

/**
 * The download itself. `no-store` because a shared reception machine must not
 * leave a file of patient names and numbers in a proxy cache.
 */
export function csvResponse(fileName: string, rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): Response {
  return new Response(CSV_BOM + toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
