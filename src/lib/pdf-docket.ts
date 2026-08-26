/**
 * The slip that travels with the case, as a file rather than as a printout.
 *
 * The docket already existed as a page the browser prints — same fields, same
 * order, same chart. What it could not do was *leave*. A box going to the
 * laboratory has a slip in it, but a laboratory that asks "what was on the
 * docket for the Berisha bridge" wants something sent, and a screenshot of a
 * print preview is not that. This is the same document as a PDF: one file, the
 * same on every machine, with the practice's mark on it.
 *
 * ## Why it is drawn twice
 *
 * `works/[id]/print/page.tsx` renders this in JSX and this file renders it in
 * PDF operators, and the two have to agree. That is a real cost and it is paid
 * deliberately: the screen version is what somebody checks before pressing
 * print, and it has to live inside the app's own chrome, with breadcrumbs and a
 * button. Making the screen embed the PDF instead would mean a viewer, a plugin
 * and a blank grey rectangle wherever it fails to load.
 *
 * What is *not* duplicated is the content. Both are handed the same fields, in
 * the same order, from the same row — and the chart is drawn from `mergeSpans`
 * on both sides, so the teeth cannot differ.
 *
 * ## What is deliberately left blank
 *
 * The stage lines at the foot — metal frame, dentine try-in, completion, custom
 * tray — and the shade are ruled and empty, exactly as they are on the pad. Those
 * are filled in *by the laboratory*, after the box arrives, and the practice's
 * copy of the register has nothing to say about them. Printing an empty rule for
 * a technician's pen is the honest shape of this document.
 */

import {
  CELL_PAD_X,
  FAINT,
  HAIRLINE,
  INK,
  LEADING,
  MARGIN,
  RULE,
  RULE_HEAVY,
  SIZE,
  TINT,
  drawFoot,
  drawLetterhead,
  drawRule,
  drawStack,
  finishPaper,
  heightOf,
  openPaper,
  winAnsi,
  wrap,
  type Paper,
  type SheetHead,
} from './pdf';
import { PERMANENT_LOWER, PERMANENT_UPPER } from './teeth';
import { spanDigit, type SpanPosition } from './tooth-span';
import type { PDFPage } from 'pdf-lib';

/** One labelled field of the pad's head. */
export type DocketField = {
  label: string;
  /** Empty rules a blank line rather than printing nothing — see `blank`. */
  value: string;
  /** Run across the whole width, for a field the pad gives a line of its own. */
  wide?: boolean;
};

export type DocketLine = { procedure: string; teeth: string; elements: string };

export type DocketSpec = SheetHead & {
  /** The head of the pad, field for field and in its order. */
  fields: DocketField[];
  /** Printed in a ruled box when the case is flagged, blank when it is not. */
  urgent?: string;
  work: {
    headers: { procedure: string; teeth: string; elements: string };
    lines: DocketLine[];
    total: { label: string; value: string };
  };
  /** Every position this case covers, already merged across its items. */
  positions: readonly SpanPosition[];
  notes?: string;
  /** The technician's half of the pad. Ruled and empty on purpose. */
  stages: string[];
  /** What goes beside each stage's second, shorter blank. */
  stageTime: string;
  footNote?: string;
  pageLabel: (page: number, pages: number) => string;
};

/** Where the pen is: which page, and how far down it. */
type Cursor = { page: PDFPage; y: number };

/** The band along the bottom that the footer owns. */
const FOOT_ROOM = MARGIN + SIZE.foot + 12;

/** Between one block of the pad and the next. */
const GAP = 14;

/** How tall one line of the head is, label and value alike. */
const FIELD_ROW = SIZE.slip * LEADING + 9;

/** The gutter between the pad's two columns of fields. */
const GUTTER = 16;

/**
 * A field with nothing in it rules a line rather than printing nothing.
 *
 * That is what the field is *for*: `Kolori` with no rule under it reads as a
 * field somebody forgot, and `Kolori` with a rule reads as a field waiting for a
 * pen. The screen version says the same thing in its own `Entry`.
 */
function drawField(
  page: PDFPage,
  paper: Paper,
  field: DocketField,
  x: number,
  y: number,
  width: number,
): void {
  const { fonts } = paper;
  const label = `${winAnsi(field.label)}:`;
  const labelWidth = fonts.bold.widthOfTextAtSize(label, SIZE.slipLabel);
  const baseline = y - SIZE.slip;

  page.drawText(label, {
    x,
    y: baseline,
    size: SIZE.slipLabel,
    font: fonts.bold,
    color: FAINT,
  });

  const from = x + labelWidth + 6;
  const value = winAnsi(field.value).trim();

  if (!value) {
    drawRule(page, { y: baseline - 2, from, to: x + width, thickness: 0.6, colour: RULE });
    return;
  }

  // Truncated rather than wrapped: every field on this pad is one line on the
  // paper it copies, and a laboratory's name that ran to two lines would push
  // the chart down the page and off the bottom of it.
  const room = x + width - from;
  let text = value;
  while (text.length > 1 && fonts.bold.widthOfTextAtSize(text, SIZE.slip) > room) {
    text = text.slice(0, -1);
  }
  page.drawText(text === value ? text : `${text.slice(0, -1)}…`, {
    x: from,
    y: baseline,
    size: SIZE.slip,
    font: fonts.bold,
    color: INK,
  });
}

/**
 * The chart already printed on the practice's own pads.
 *
 * The arch laid out flat, right-hand teeth on the left of the page, `R` and `L`
 * in the margins and a rule down the midline. On the pad the dentist rings the
 * teeth by hand; here they are already marked, from the span typed once when the
 * case was written down. That is the one thing this sheet does that the pad
 * cannot — a docket that marks the span cannot disagree with the register about
 * which teeth went to the laboratory.
 *
 * `R` and `L` are anatomical notation rather than English: every dental chart in
 * every language marks the arch that way, and the practice's own pad is printed
 * with them. They earn their place — the chart is drawn from the patient's point
 * of view, so the teeth on the left of the page are the ones on their right.
 */
function drawChart(
  page: PDFPage,
  paper: Paper,
  positions: readonly SpanPosition[],
  y: number,
): number {
  const { fonts, width } = paper;
  const marks = new Map(positions.map((position) => [position.toothNum, position.pontic]));

  /** The margins that hold the `R` and the `L`. */
  const side = 13;
  const cell = (width - side * 2) / 16;
  const rowHeight = 17;
  const size = SIZE.slipLabel;

  let top = y;

  for (const arch of [PERMANENT_UPPER, PERMANENT_LOWER]) {
    const bottom = top - rowHeight;
    const middle = bottom + rowHeight / 2 - size * 0.36;

    page.drawText('R', {
      x: MARGIN + side - 4 - fonts.bold.widthOfTextAtSize('R', size),
      y: middle,
      size,
      font: fonts.bold,
      color: FAINT,
    });

    for (const [index, toothNum] of arch.entries()) {
      const pontic = marks.get(toothNum);
      const marked = pontic !== undefined;
      const x = MARGIN + side + index * cell;

      page.drawRectangle({
        x,
        y: bottom,
        width: cell,
        height: rowHeight,
        // A wash rather than a ring, because a ring drawn round a two-digit
        // number in a cell this narrow is a smudge at 300dpi.
        color: marked ? TINT : undefined,
        borderColor: HAIRLINE,
        borderWidth: 0.5,
      });

      // A gap is written `x`, exactly as the register stores it and the docket
      // has always written it: the laboratory still makes an element for that
      // position, and printing the absent tooth's own number there would ask
      // them to make a crown for a tooth that is not in the mouth.
      const glyph = pontic ? 'x' : String(spanDigit(toothNum));
      const font = marked ? fonts.bold : fonts.regular;
      page.drawText(glyph, {
        x: x + cell / 2 - font.widthOfTextAtSize(glyph, size) / 2,
        y: middle,
        size,
        font,
        color: marked ? INK : FAINT,
      });
    }

    // The midline, heavier than the cell borders. Without it the two quadrants
    // read as one run of sixteen and `5` stops meaning a particular tooth.
    page.drawLine({
      start: { x: MARGIN + side + cell * 8, y: top },
      end: { x: MARGIN + side + cell * 8, y: bottom },
      thickness: 1.2,
      color: INK,
    });

    page.drawText('L', {
      x: MARGIN + width - side + 4,
      y: middle,
      size,
      font: fonts.bold,
      color: FAINT,
    });

    top = bottom;
  }

  return top;
}

/**
 * The docket.
 *
 * Drawn top to bottom with a cursor rather than measured and dealt out like the
 * register, because this is a pad slip: nearly always one page, and the blocks
 * on it are a fixed sequence rather than a list of unknown length. The one thing
 * that can grow is the table of work, so the cursor checks for room before each
 * row and takes a second page when a case is big enough to need one.
 */
export async function renderDocket(spec: DocketSpec): Promise<Uint8Array> {
  const paper = await openPaper();
  const { pdf, fonts, size, width } = paper;

  const first = pdf.addPage(size);
  const cursor: Cursor = { page: first, y: drawLetterhead(first, paper, spec) };
  const pages: PDFPage[] = [first];

  /**
   * Take a new page when what comes next will not fit above the footer.
   *
   * `then` is what the new page has to reopen with — for the table of work, its
   * column headings. A continuation page of bare rows leaves a technician
   * reading a column of bare numbers with nothing to say they are elements.
   */
  const ensure = (needed: number, then?: () => void) => {
    if (cursor.y - needed >= FOOT_ROOM) return;
    cursor.page = pdf.addPage(size);
    cursor.y = drawLetterhead(cursor.page, paper, spec);
    pages.push(cursor.page);
    then?.();
  };

  // The head of the pad, two fields to a line where the pad has two — a
  // technician reads this by position as much as by label, and after a few
  // hundred of them the eye goes straight to the top right for the laboratory.
  const half = (width - GUTTER) / 2;
  for (let index = 0; index < spec.fields.length; index += 1) {
    const field = spec.fields[index];
    const next = spec.fields[index + 1];
    ensure(FIELD_ROW);

    if (field.wide || !next || next.wide) {
      drawField(cursor.page, paper, field, MARGIN, cursor.y, field.wide ? width : half);
    } else {
      drawField(cursor.page, paper, field, MARGIN, cursor.y, half);
      drawField(cursor.page, paper, next, MARGIN + half + GUTTER, cursor.y, half);
      index += 1;
    }
    cursor.y -= FIELD_ROW;
  }

  if (spec.urgent) {
    const label = winAnsi(spec.urgent.toUpperCase());
    const boxHeight = SIZE.slip + 12;
    ensure(boxHeight + GAP);
    cursor.y -= 6;
    cursor.page.drawRectangle({
      x: MARGIN,
      y: cursor.y - boxHeight,
      width,
      height: boxHeight,
      borderColor: INK,
      borderWidth: 1.6,
    });
    cursor.page.drawText(label, {
      x: MARGIN + width / 2 - fonts.bold.widthOfTextAtSize(label, SIZE.slip) / 2,
      y: cursor.y - boxHeight + 8,
      size: SIZE.slip,
      font: fonts.bold,
      color: INK,
    });
    cursor.y -= boxHeight + GAP;
  } else {
    cursor.y -= GAP;
  }

  // What is being made. The pad has one line for this and the register has a row
  // per piece, so the docket prints the rows — a case that is a crown and a
  // bridge should not arrive as one hand-compressed phrase.
  const columns = [
    { header: spec.work.headers.procedure, weight: 52, align: 'left' as const },
    { header: spec.work.headers.teeth, weight: 32, align: 'left' as const },
    { header: spec.work.headers.elements, weight: 16, align: 'right' as const },
  ];
  const weight = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (column.weight / weight) * width);
  const xs = widths.reduce<number[]>((acc, _, index) => {
    acc.push(index === 0 ? MARGIN : acc[index - 1] + widths[index - 1]);
    return acc;
  }, []);

  const drawWorkHeadings = () => {
    for (const [index, column] of columns.entries()) {
      const text = winAnsi(column.header.toUpperCase());
      const x =
        column.align === 'right'
          ? xs[index] + widths[index] - fonts.bold.widthOfTextAtSize(text, SIZE.head)
          : xs[index];
      cursor.page.drawText(text, {
        x,
        y: cursor.y - SIZE.head,
        size: SIZE.head,
        font: fonts.bold,
        color: FAINT,
      });
    }
    cursor.y -= SIZE.head * LEADING + 4;
    drawRule(cursor.page, { y: cursor.y, from: MARGIN, to: MARGIN + width, colour: RULE });
  };

  ensure(SIZE.head * LEADING + 6);
  drawWorkHeadings();

  for (const line of spec.work.lines) {
    const cells = [
      wrap({ text: line.procedure, bold: true, size: SIZE.slip }, widths[0] - CELL_PAD_X, fonts),
      wrap({ text: line.teeth || '—', tone: 'soft', size: SIZE.slipLabel }, widths[1] - CELL_PAD_X, fonts),
      wrap({ text: line.elements, bold: true, size: SIZE.slip }, widths[2], fonts),
    ];
    const height = Math.max(...cells.map(heightOf)) + 10;
    ensure(height, drawWorkHeadings);

    for (const [index, lines] of cells.entries()) {
      drawStack(cursor.page, lines, {
        x: xs[index],
        y: cursor.y - 5,
        width: widths[index],
        align: columns[index].align,
      });
    }
    cursor.y -= height;
    drawRule(cursor.page, { y: cursor.y, from: MARGIN, to: MARGIN + width, colour: HAIRLINE });
  }

  // The count the laboratory bills on, under the column it counts.
  const totalLabel = winAnsi(spec.work.total.label.toUpperCase());
  const totalValue = winAnsi(spec.work.total.value);
  ensure(SIZE.slip * LEADING + 10);
  cursor.y -= 5;
  cursor.page.drawText(totalLabel, {
    x: xs[2] - 8 - fonts.bold.widthOfTextAtSize(totalLabel, SIZE.head),
    y: cursor.y - SIZE.slip,
    size: SIZE.head,
    font: fonts.bold,
    color: FAINT,
  });
  cursor.page.drawText(totalValue, {
    x: MARGIN + width - fonts.bold.widthOfTextAtSize(totalValue, SIZE.slip + 1),
    y: cursor.y - SIZE.slip,
    size: SIZE.slip + 1,
    font: fonts.bold,
    color: INK,
  });
  cursor.y -= SIZE.slip * LEADING + GAP;

  ensure(17 * 2 + GAP);
  cursor.y = drawChart(cursor.page, paper, spec.positions, cursor.y) - GAP;

  if (spec.notes?.trim()) {
    const lines = wrap({ text: spec.notes, tone: 'soft', size: SIZE.slipLabel }, width, fonts);
    ensure(heightOf(lines) + 6);
    cursor.y = drawStack(cursor.page, lines, { x: MARGIN, y: cursor.y, width }) - GAP;
  }

  // The technician's half of the pad, ruled and empty — see the note at the top.
  if (spec.stages.length > 0) {
    ensure(18);

    // Dropped to the foot of the page when there is room to spare, because that
    // is where the pad puts it: these lines are filled in later, by somebody
    // else, and a block of blanks floating halfway down an otherwise empty page
    // reads as a document that was cut short. Only ever pushed *down* — a case
    // long enough to fill the page keeps them exactly where the work ended.
    // `min`, because y counts up the page: the smaller of the two is the lower
    // on the paper, and the block never rises above where the work left off.
    const stagesHeight = GAP + spec.stages.length * 24;
    cursor.y = Math.min(cursor.y, FOOT_ROOM + stagesHeight);
    drawRule(cursor.page, {
      y: cursor.y,
      from: MARGIN,
      to: MARGIN + width,
      thickness: 1.2,
      colour: RULE_HEAVY,
    });
    cursor.y -= GAP;

    const time = `${winAnsi(spec.stageTime)}:`;
    const timeWidth = fonts.bold.widthOfTextAtSize(time, SIZE.slipLabel);
    /** Enough for a date and an hour in a technician's handwriting. */
    const timeRule = 76;

    for (const stage of spec.stages) {
      ensure(24);
      const label = `${winAnsi(stage)}:`;
      const baseline = cursor.y - SIZE.slip;
      cursor.page.drawText(label, {
        x: MARGIN,
        y: baseline,
        size: SIZE.slipLabel,
        font: fonts.bold,
        color: INK,
      });

      const from = MARGIN + fonts.bold.widthOfTextAtSize(label, SIZE.slipLabel) + 6;
      const timeAt = MARGIN + width - timeRule - timeWidth - 6;
      drawRule(cursor.page, { y: baseline - 2, from, to: timeAt - 8, colour: RULE });

      cursor.page.drawText(time, {
        x: timeAt,
        y: baseline,
        size: SIZE.slipLabel,
        font: fonts.bold,
        color: INK,
      });
      drawRule(cursor.page, {
        y: baseline - 2,
        from: timeAt + timeWidth + 6,
        to: MARGIN + width,
        colour: RULE,
      });

      cursor.y -= 24;
    }
  }

  for (const [index, page] of pages.entries()) {
    drawFoot(page, paper, {
      note: index === 0 ? spec.footNote : undefined,
      label: spec.pageLabel(index + 1, pages.length),
    });
  }

  return finishPaper(paper, spec);
}
