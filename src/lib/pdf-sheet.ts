/**
 * A table that runs over pages — the shape the works register is printed in.
 *
 * Columns that keep their widths across a page break, cells that wrap rather
 * than truncate, headings repeated at the top of every page, and a total that
 * cannot be scrolled away from. The type, the letterhead and the folding come
 * from `pdf.ts`; what is here is the table.
 *
 * It knows nothing about laboratories. What it is given is columns, rows and a
 * total — `works-sheet.ts` is what turns a month of cases into those.
 */

import {
  CELL_PAD_X,
  CELL_PAD_Y,
  FAINT,
  HAIRLINE,
  INK,
  LEADING,
  MARGIN,
  RULE,
  RULE_HEAVY,
  SIZE,
  drawFoot,
  drawLetterhead,
  drawRule,
  finishPaper,
  openPaper,
  winAnsi,
  wrap,
  type Fonts,
  type Line,
  type Paper,
  type SheetHead,
  type SheetSpan,
} from './pdf';
import type { PDFPage } from 'pdf-lib';

/**
 * One cell. `null` means *this column is continued from the row above* — the
 * register writes a case's own columns once and lets its items run underneath,
 * which is how the paper ledger is kept and how the screen renders it with
 * `rowSpan`.
 */
export type SheetCell = SheetSpan[] | null;

export type SheetRow = {
  cells: SheetCell[];
  /**
   * Whether this row opens a new group. Drawn with the heavier rule, and the
   * only place a page break is allowed to fall — see `paginate`.
   */
  opensGroup?: boolean;
};

export type SheetColumn = {
  header: string;
  /**
   * A weight, not a measurement. Columns are scaled to whatever the page has
   * left after its margins, so a caller describes the *shape* of the table and
   * never has to know the paper size — which is the only way one column list can
   * print portrait and landscape.
   */
  width: number;
  align?: 'left' | 'right';
  /**
   * A column of empty tick boxes rather than of type: a box is drawn in every
   * cell of it that is not a continuation, and any spans the cell holds are
   * ignored. It is the one column of the sheet the paper is expected to be
   * *written on* — see the note on the register's own check column — so it is
   * described here rather than faked with a character, which no encoding these
   * fonts can write has anyway.
   */
  box?: boolean;
};

export type SheetSpec = SheetHead & {
  columns: SheetColumn[];
  rows: SheetRow[];
  /** The figure the sheet exists for, ruled off under the column it counts. */
  total?: { label: string; value: string; column: number };
  /** Bottom left, small. Usually what was exported and when. */
  footNote?: string;
  /** Bottom right. A function because the wording is the caller's, and localised. */
  pageLabel: (page: number, pages: number) => string;
  /** Printed in place of the table when there is nothing in it. */
  emptyNote?: string;
  landscape?: boolean;
};

/** A row measured: every cell already broken into lines, and how tall that makes it. */
type LaidRow = { lines: (Line[] | null)[]; height: number; opensGroup: boolean };

function layRow(row: SheetRow, widths: number[], fonts: Fonts): LaidRow {
  const lines = row.cells.map((cell, index) =>
    cell ? cell.flatMap((span) => wrap(span, widths[index] - CELL_PAD_X * 2, fonts)) : null,
  );

  const tallest = Math.max(
    SIZE.body * LEADING,
    ...lines.map((cell) =>
      cell ? cell.reduce((sum, line) => sum + line.size * LEADING, 0) : 0,
    ),
  );
  return { lines, height: tallest + CELL_PAD_Y * 2, opensGroup: Boolean(row.opensGroup) };
}

/**
 * Which rows go on which page.
 *
 * One rule beyond "fill the page": a case is not split across a page break if it
 * fits on a page at all. A bridge whose four items straddle a fold reads as two
 * cases to whoever is checking the invoice, and the count in the element column
 * is exactly what they are checking. A case too tall for any page still has to
 * break somewhere, and breaks where it runs out of room.
 */
function paginate(rows: LaidRow[], firstRoom: number, laterRoom: number): LaidRow[][] {
  const pages: LaidRow[][] = [];
  let current: LaidRow[] = [];
  let room = firstRoom;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    // What this case needs: from here to the row before the next one opens. Never
    // more than a page, or a case taller than the paper would break every page it
    // could not fit on and never get drawn.
    let block = row.height;
    if (row.opensGroup) {
      for (let ahead = index + 1; ahead < rows.length && !rows[ahead].opensGroup; ahead += 1) {
        block += rows[ahead].height;
      }
      block = Math.min(block, laterRoom);
    }

    if (current.length > 0 && block > room) {
      pages.push(current);
      current = [];
      room = laterRoom;
    }

    current.push(row);
    room -= row.height;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

/** The gap between the lowest heading and the rule under it. */
const HEADINGS_GAP = 5;

/**
 * The column headings, broken to their columns.
 *
 * They wrap for the same reason the cells do, and it is not a nicety: *Lab
 * serial no.* is `Nr. serial i lab.` in Albanian over a column four digits wide,
 * and a heading drawn as one line simply runs across the top of the next column
 * and prints one word over another. Measured once for the whole document, so
 * every page's headings are the same height and the tables line up if two pages
 * are laid side by side.
 */
type Headings = { lines: Line[][]; height: number };

function layHeadings(spec: SheetSpec, fonts: Fonts, widths: number[]): Headings {
  const lines = spec.columns.map((column, index) =>
    wrap(
      { text: column.header.toUpperCase(), bold: true, tone: 'faint', size: SIZE.head },
      widths[index] - CELL_PAD_X * 2,
      fonts,
    ),
  );
  const deepest = Math.max(1, ...lines.map((column) => column.length));
  return { lines, height: deepest * SIZE.head * LEADING + HEADINGS_GAP };
}

/** The headings and the rule under them, repeated on every page. */
function drawHeadings(
  page: PDFPage,
  spec: SheetSpec,
  headings: Headings,
  widths: number[],
  xs: number[],
  top: number,
  width: number,
): number {
  const bottom = top - headings.height;

  for (const [index, lines] of headings.lines.entries()) {
    // Set from the rule upwards, so headings of one and of three lines share a
    // baseline at the bottom — the screen's own `align-bottom`, and the only
    // arrangement in which a tall heading does not look like a different row.
    for (const [line, span] of lines.entries()) {
      const y = bottom + HEADINGS_GAP + (lines.length - 1 - line) * SIZE.head * LEADING;
      const text = span.font.widthOfTextAtSize(span.text, span.size);
      // A box column is headed over its boxes, which are centred — a heading set
      // to the left of a centred box reads as a heading for the column before it.
      const x = spec.columns[index].box
        ? xs[index] + (widths[index] - text) / 2
        : spec.columns[index].align === 'right'
          ? xs[index] + widths[index] - CELL_PAD_X - text
          : xs[index] + CELL_PAD_X;
      page.drawText(span.text, { x, y, size: span.size, font: span.font, color: span.colour });
    }
  }

  drawRule(page, {
    y: bottom,
    from: MARGIN,
    to: MARGIN + width,
    thickness: 0.9,
    colour: RULE_HEAVY,
  });
  return bottom;
}

/** The side of a tick box, in points. A pen's width, not a spreadsheet's. */
const BOX = 9;

/**
 * An empty tick box, centred in its column and sitting on the first line's
 * baseline — so a column of them lines up with the type beside it rather than
 * with the top of the cell, which on a two-line row would leave it floating
 * above the name it belongs to.
 */
function drawBox(page: PDFPage, x: number, width: number, top: number): void {
  page.drawRectangle({
    x: x + (width - BOX) / 2,
    y: top - CELL_PAD_Y - SIZE.body * LEADING + SIZE.body * 0.22 - 0.5,
    width: BOX,
    height: BOX,
    borderWidth: 0.8,
    borderColor: RULE,
  });
}

/**
 * The sheet.
 *
 * Measure, place, then draw — the page count has to be known before the first
 * footer can say "1 of 3", and every row's height has to be known before the
 * page count can be.
 */
export async function renderSheet(spec: SheetSpec): Promise<Uint8Array> {
  const paper: Paper = await openPaper(spec.landscape);
  const { pdf, fonts, size, width } = paper;

  // Weights into points, once — so every page's columns are the same columns.
  const weight = spec.columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const widths = spec.columns.map((column) => (column.width / weight) * width);
  const xs = widths.reduce<number[]>((acc, _, index) => {
    acc.push(index === 0 ? MARGIN : acc[index - 1] + widths[index - 1]);
    return acc;
  }, []);

  const headings = layHeadings(spec, fonts, widths);
  const laid = spec.rows.map((row) => layRow(row, widths, fonts));

  // The first page is drawn before anything can be measured against it, so its
  // letterhead goes down now and the height it leaves is measured off the real
  // page rather than a throwaway. Every page carries the same letterhead, so
  // every page has the same room — which is why one number does for both.
  const first = pdf.addPage(size);
  const top = drawLetterhead(first, paper, spec);

  const footRoom = MARGIN + SIZE.foot + 10;
  // Kept on every page although the total only prints on the last. Which page
  // that is cannot be known until the rows have been dealt out, and a page short
  // by one row is a far smaller cost than a total that lands by itself on a page
  // of its own with nothing above it.
  const totalRoom = spec.total ? SIZE.body * LEADING + CELL_PAD_Y * 2 + 6 : 0;
  const room = top - footRoom - totalRoom - headings.height;
  // An empty register still prints a page: the letterhead, the headings and the
  // note saying there was nothing in it. A zero-page PDF is a broken download.
  const pages = spec.rows.length > 0 ? paginate(laid, room, room) : [[]];

  const drawn: PDFPage[] = [];

  for (const [index, rows] of pages.entries()) {
    const page = index === 0 ? first : pdf.addPage(size);
    drawn.push(page);
    const pageTop = index === 0 ? top : drawLetterhead(page, paper, spec);
    let y = drawHeadings(page, spec, headings, widths, xs, pageTop, width);

    for (const row of rows) {
      // The rule that opens a case is drawn above its first row rather than
      // under the last row of the one before, so it is there even when the case
      // is the first thing on a page. The first row of a page needs none: the
      // headings already ruled it off.
      if (row !== rows[0]) {
        // A continuation rule is drawn only across the columns the row actually
        // writes in. The columns above it holding `null` are one cell running
        // down the whole case — ruling through them would cut a patient's name
        // in half. Which columns those are is not this file's business to know,
        // so it is read off the row: the rule starts at the first cell that is
        // not a continuation.
        const from = row.lines.findIndex((cell) => cell !== null);
        drawRule(page, {
          y,
          from: row.opensGroup || from <= 0 ? MARGIN : xs[from],
          to: MARGIN + width,
          thickness: row.opensGroup ? 0.7 : 0.4,
          colour: row.opensGroup ? RULE : HAIRLINE,
        });
      }

      for (const [column, lines] of row.lines.entries()) {
        if (!lines) continue;

        // A box column holds no type. Drawn on the first row of a case only,
        // because `null` on the rows under it is what says the case continues —
        // the same rule the patient's name is written by, and the reason a case
        // of four crowns gets one box to tick rather than four.
        if (spec.columns[column].box) {
          drawBox(page, xs[column], widths[column], y);
          continue;
        }

        let cellY = y - CELL_PAD_Y;
        for (const line of lines) {
          cellY -= line.size * LEADING;
          const x =
            spec.columns[column].align === 'right'
              ? xs[column] +
                widths[column] -
                CELL_PAD_X -
                line.font.widthOfTextAtSize(line.text, line.size)
              : xs[column] + CELL_PAD_X;
          // The line box's bottom is `cellY`; the baseline sits a descender above it.
          page.drawText(line.text, {
            x,
            y: cellY + line.size * 0.22,
            size: line.size,
            font: line.font,
            color: line.colour,
          });
        }
      }

      y -= row.height;
    }

    if (rows.length === 0 && spec.emptyNote) {
      page.drawText(winAnsi(spec.emptyNote), {
        x: MARGIN + CELL_PAD_X,
        y: y - CELL_PAD_Y - SIZE.body,
        size: SIZE.body,
        font: fonts.regular,
        color: FAINT,
      });
    }

    // The total goes under the column it counts, on the last page only.
    if (spec.total && index === pages.length - 1) {
      drawRule(page, {
        y,
        from: MARGIN,
        to: MARGIN + width,
        thickness: 1.2,
        colour: RULE_HEAVY,
      });

      const at = spec.total.column;
      const value = winAnsi(spec.total.value);
      const label = winAnsi(spec.total.label.toUpperCase());
      const baseline = y - CELL_PAD_Y - SIZE.body * LEADING + SIZE.body * 0.22;

      page.drawText(value, {
        x: xs[at] + widths[at] - CELL_PAD_X - fonts.bold.widthOfTextAtSize(value, SIZE.body + 1),
        y: baseline,
        size: SIZE.body + 1,
        font: fonts.bold,
        color: INK,
      });
      // Set in the columns to the left of the figure, running back from it, so
      // the label cannot push the number out of its own column.
      page.drawText(label, {
        x: xs[at] - CELL_PAD_X - fonts.bold.widthOfTextAtSize(label, SIZE.head),
        y: baseline,
        size: SIZE.head,
        font: fonts.bold,
        color: FAINT,
      });
    }
  }

  // Footers last: "1 of 3" cannot be written until the 3 is known.
  for (const [index, page] of drawn.entries()) {
    drawFoot(page, paper, {
      note: index === 0 ? spec.footNote : undefined,
      label: spec.pageLabel(index + 1, drawn.length),
    });
  }

  return finishPaper(paper, spec);
}
