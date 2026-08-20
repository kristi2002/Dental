/**
 * Reading a spreadsheet back in.
 *
 * `csv.ts` writes files for Excel; this reads the files Excel writes, which is a
 * harder problem, because what arrives is whatever the sending machine happened
 * to produce. Everything here is a concession to one real shape of that:
 *
 *  - **The delimiter is sniffed, not assumed.** An Albanian or Italian Windows
 *    saves `;` and an English one saves `,` — the same reason `csv.ts` writes
 *    semicolons — and the practice being handed a list by another clinic has no
 *    idea which it is holding. Tabs are in the list too, because "copy out of
 *    Excel and paste into a text file" is a real way people produce these.
 *  - **A `sep=` first line is honoured and swallowed.** Our own export writes
 *    one, so a file that made a round trip through this app must come back in.
 *  - **The BOM is stripped.** Our export writes one so Excel reads UTF-8; left
 *    in place it becomes part of the first column's title and no header matches.
 *  - **Quotes work the way RFC 4180 says**, including `""` for a literal quote
 *    and newlines inside a quoted field, because the notes column of anything
 *    exported from this app contains both.
 *
 * Deliberately not a dependency. The whole grammar is below in fifty lines, and
 * a parser is a poor thing to hand to the supply chain of an app that holds
 * medical records.
 *
 * **Not an `.xlsx` reader.** That is a zip of XML and genuinely needs a library.
 * Excel's own "Save as CSV" is one menu item, and the import screen says so.
 */

/** The separators worth guessing between, in the order ties are broken. */
const CANDIDATES = [';', ',', '\t'] as const;

/** Excel's own hint, which our export writes: `sep=;` on a line of its own. */
const SEP_HINT = /^sep=(.)\r?\n/i;

/**
 * How many leading characters to sniff the delimiter from.
 *
 * The header row plus a few data rows is enough to tell a semicolon file from a
 * comma one, and bounding it keeps a pasted 40 MB file from being scanned twice.
 */
const SNIFF_LENGTH = 8192;

/**
 * Which separator this file is written with.
 *
 * Counted outside quotes only. A file of names is full of commas inside quoted
 * fields — `"Krasniqi, Arta"` — and counting those would pick the comma for a
 * semicolon file every time, which splits every row in the wrong place and
 * produces a preview screen full of nonsense rather than an error.
 */
export function sniffDelimiter(text: string): string {
  const hint = SEP_HINT.exec(text);
  if (hint) return hint[1];

  const sample = text.slice(0, SNIFF_LENGTH);
  const counts = new Map<string, number>(CANDIDATES.map((c) => [c, 0]));

  let quoted = false;
  for (let i = 0; i < sample.length; i += 1) {
    const char = sample[i];
    if (char === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not the end
      // of one — stepping over it keeps the rest of the line on the right side.
      if (quoted && sample[i + 1] === '"') i += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }

  let best: string = CANDIDATES[0];
  for (const candidate of CANDIDATES) {
    if (counts.get(candidate)! > counts.get(best)!) best = candidate;
  }
  // Nothing found at all — a single-column file. The semicolon default is
  // harmless there: one column splits the same however it is read.
  return best;
}

/**
 * The file as a grid of strings.
 *
 * Blank lines are dropped, including the trailing one every text file ends with;
 * a row of empty cells is not, because that is a row somebody left blank in the
 * middle of their list and the import screen should be able to point at it.
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  // The BOM first, before anything looks at the first character.
  let text = input.replace(/^﻿/, '');

  const sep = delimiter ?? sniffDelimiter(text);
  text = text.replace(SEP_HINT, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  /** Whether the current field had quotes, so `""` stays an empty string. */
  let seenQuote = false;

  const endField = () => {
    row.push(seenQuote ? field : field.trim());
    field = '';
    seenQuote = false;
  };

  const endRow = () => {
    endField();
    // A line that held nothing at all is file furniture, not data.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }

    if (char === '"') {
      quoted = true;
      seenQuote = true;
      continue;
    }
    if (char === sep) {
      endField();
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      endRow();
      continue;
    }
    field += char;
  }

  // Whatever the file ended on, with or without a final newline.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Match a file's column titles against the ones we know, forgivingly.
 *
 * The file being imported was not written by this app — it is a list somebody
 * has kept in Excel for nine years — so a header match has to survive case,
 * accents, punctuation and stray spaces. `Datëlindja`, `datelindja` and
 * `DATE LINDJA ` are the same column, and refusing the last two would send
 * somebody back to retype a header row for no reason.
 */
export function normaliseHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Which column of the file holds each field we want.
 *
 * `aliases` is field name → the titles that mean it, in every language the app
 * speaks plus whatever a practice is likely to have typed. The first match down
 * the row wins, so a file with two plausible columns for one field takes the
 * leftmost — which is the one a person reading the file would also assume.
 *
 * Returns `-1` for a field the file does not have; the caller decides whether
 * that is fatal.
 */
export function matchColumns<Field extends string>(
  headerRow: readonly string[],
  aliases: Record<Field, readonly string[]>,
): Record<Field, number> {
  const seen = headerRow.map(normaliseHeader);
  const out = {} as Record<Field, number>;

  for (const field of Object.keys(aliases) as Field[]) {
    const wanted = new Set(aliases[field].map(normaliseHeader));
    out[field] = seen.findIndex((title) => wanted.has(title));
  }

  return out;
}
