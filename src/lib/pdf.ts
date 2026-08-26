/**
 * Paper, made by the app rather than by the browser.
 *
 * Most of what this practice prints is an ordinary page that somebody presses
 * Ctrl+P on, and for a sheet read on screen first and printed once that is the
 * right shape. Two documents are not that. The register is eight columns wide
 * and a month long; the laboratory docket goes in a box and out of the building.
 * Both are *sent* — as an attachment, to somebody who was not standing at the
 * screen — and what arrives has to be the same document whichever machine it
 * left from. A browser's print dialogue is a different document on every one of
 * them, with the operating system's own headers written across the top and the
 * practice's letterhead scaled to whatever the driver felt like.
 *
 * So these draw the page themselves. This file is the kit they share — the
 * letterhead, the type, the rules, and the folding that keeps a name printable.
 * What is built on it lives next door: `pdf-sheet.ts` for a table that runs over
 * pages, `pdf-docket.ts` for the slip that travels with one case.
 *
 * ## Why not a headless browser
 *
 * The obvious answer to "I have the HTML and I want a PDF" is Chromium, and it
 * costs three hundred megabytes in the image, a second of CPU per render, and a
 * whole class of deployment problem on a box that is running one practice's
 * server. `pdf-lib` is a few hundred kilobytes of JavaScript and no binary at
 * all. The price is that this file exists.
 *
 * ## Fonts, and the one thing to know about them
 *
 * The fourteen standard PDF fonts need no embedding, which is most of why the
 * files this produces are tens of kilobytes rather than megabytes. They are
 * encoded WinAnsi — Latin-1 plus the Windows extras — which covers every letter
 * Albanian and Italian are written in, `ë` and `ç` included. It does not cover
 * everything a name field can hold, so text is folded to what the encoding can
 * take before it is drawn; see `winAnsi`. Shipping a Unicode face and embedding
 * a subset of it is the real answer if this practice ever registers a patient
 * whose name needs one.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

/** A4, in points, the way the rest of the world prints. */
export const A4 = { width: 595.28, height: 841.89 };

/** ~12.7mm. Enough that a laser printer's unprintable edge never eats a rule. */
export const MARGIN = 36;

/** The app's own greys, so a printed sheet and the screen it came from match. */
export const INK = rgb(0.216, 0.278, 0.31); // --color-ink       #37474f
export const SOFT = rgb(0.373, 0.443, 0.471); // --color-ink-soft  #5f7178
export const FAINT = rgb(0.478, 0.541, 0.565); // a shade off --color-ink-faint, for paper

/** The wash behind a marked cell on the docket's chart — `--color-line`, lightened. */
export const TINT = rgb(0.925, 0.945, 0.953);

/**
 * Rules, three weights.
 *
 * `--color-line` is #e7ecee, which is a sensible hairline on a backlit screen
 * and very nearly nothing on paper — a 600dpi laser renders it as a grey
 * rumour. So the printed hairline is the screen's *strong* line, and everything
 * above it steps up from there.
 */
export const HAIRLINE = rgb(0.804, 0.847, 0.863); // #cdd8dc — between the items of one case
export const RULE = rgb(0.565, 0.643, 0.671); //             — between one case and the next
export const RULE_HEAVY = INK; //                            — under the headings, over the total

export const SIZE = {
  body: 8.5,
  small: 7.5,
  head: 7.5,
  title: 11,
  name: 12,
  foot: 7,
  /**
   * The docket is read at arm's length by a technician with a case in the other
   * hand, and it holds a dozen facts rather than a month of them. It gets its
   * own two sizes rather than borrowing the register's, which are sized to fit
   * forty rows on a page.
   */
  slip: 10.5,
  slipLabel: 8.5,
};

/** Leading, as a multiple of the type size. Tight, because a register is a list. */
export const LEADING = 1.25;

/** Breathing room inside a cell, top and bottom. */
export const CELL_PAD_Y = 4.5;

/** Between a column's edge and the type inside it. */
export const CELL_PAD_X = 4;

export type SheetTone = 'ink' | 'soft' | 'faint';

/** A run of type inside a cell. A cell stacks these, one per line. */
export type SheetSpan = {
  text: string;
  bold?: boolean;
  tone?: SheetTone;
  /** Points. Defaults to the body size; pass `SHEET_SMALL` for a subtitle line. */
  size?: number;
};

/** The size a second line inside a cell is set at — a phone number under a name. */
export const SHEET_SMALL = SIZE.small;

export type SheetLetterhead = {
  /** The practice's name, or empty on an install where nobody has filled it in. */
  name: string;
  /** Phone, email, address — whichever are filled in, already trimmed. */
  contact: string[];
};

/** The top of the page, which every document this practice prints shares. */
export type SheetHead = {
  letterhead: SheetLetterhead;
  /** What this sheet is: "Works register", "Lab docket". Printed opposite the mark. */
  title: string;
  /** The one fact level with the title — a month, a case number. */
  meta?: string;
};

/**
 * The Windows extras that sit above Latin-1 in WinAnsi — the curly quotes, the
 * dashes, the ellipsis. Worth keeping, because they are what a text field
 * actually collects when somebody pastes out of Word.
 */
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

function encodable(code: number): boolean {
  // Printable ASCII, then Latin-1's own upper half, then the extras above.
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_EXTRAS.has(code);
}

/**
 * Latin letters that stripping accents does not reach.
 *
 * Most of the alphabet folds by decomposition — `ş` is an `s` with a cedilla and
 * says so in its own Unicode data. These do not: a Turkish dotless `ı` is not a
 * modified `i`, it is its own letter, and `ł` is a `l` with the stroke drawn
 * through the letter rather than added to it. Left to the general rule they
 * would each come out as `?`, which is a poor way to print half of a name that
 * is otherwise perfectly Latin. This list is short on purpose: it is for letters
 * a European surname can plausibly contain, not for transliterating scripts.
 */
const FOLDED: Record<string, string> = {
  ı: 'i',
  İ: 'I',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ħ: 'h',
  Ħ: 'H',
  ŧ: 't',
  Ŧ: 'T',
  ə: 'e',
  Ə: 'E',
};

/**
 * Text the standard fonts can actually draw.
 *
 * A patient's name is whatever was typed into the box, and `pdf-lib` throws
 * rather than substitutes when a character falls outside the encoding — which
 * would turn one Turkish surname in a month of cases into a 500 on the export
 * button, with nothing on screen to say which row caused it.
 *
 * So anything unencodable is decomposed and stripped of its accents first: `ş`
 * becomes `s`, `ğ` becomes `g`, and the name is still recognisably the name.
 * Only what has no Latin form at all — a Cyrillic or Greek letter — falls
 * through to `?`, which is visibly wrong on the page, and that is the right way
 * for it to fail: whoever is holding the sheet can see a character is missing
 * and go and look it up rather than trusting a silent guess.
 *
 * Note what is *not* folded. `ë` and `ç` are in Latin-1, so they are encodable,
 * so they are left exactly as they were typed. Folding those would be the bug.
 */
export function winAnsi(text: string): string {
  let out = '';
  // Flattened before the fold, not after: a cell is laid out line by line by the
  // caller, so a newline inside one run would print one line on top of another —
  // and left to the fold below it would come out as `?`, which is worse than the
  // line break it started as.
  for (const char of text.replace(/[\t\r\n]+/g, ' ')) {
    const code = char.codePointAt(0) ?? 0;
    if (encodable(code)) {
      out += char;
      continue;
    }
    const stripped = char.normalize('NFD').replace(/\p{M}/gu, '');
    const folded =
      stripped && [...stripped].every((c) => encodable(c.codePointAt(0) ?? 0)) ? stripped : '';
    out += folded || FOLDED[char] || '?';
  }
  return out;
}

/**
 * The practice's mark, read off disk once per process.
 *
 * `public/` is copied into the runtime image beside the server — see the
 * Dockerfile — so this is the same artwork the browser is served. One logo,
 * whether the letterhead is drawn in JSX by `SheetHead` or in PDF operators by
 * this.
 *
 * A missing file is not worth failing an export over: the sheet still carries
 * the practice's name and its contact details, which is what makes it findable.
 * So this answers `null` and the letterhead prints without it.
 */
let logoBytes: Promise<Uint8Array | null> | null = null;

function readLogo(): Promise<Uint8Array | null> {
  logoBytes ??= readFile(path.join(process.cwd(), 'public', 'brand', 'logo.png'))
    .then((buffer) => new Uint8Array(buffer))
    .catch(() => null);
  return logoBytes;
}

const COLOURS: Record<SheetTone, ReturnType<typeof rgb>> = { ink: INK, soft: SOFT, faint: FAINT };

export type Fonts = { regular: PDFFont; bold: PDFFont };

/** One line of type, ready to draw: the string and everything about how it is set. */
export type Line = { text: string; font: PDFFont; size: number; colour: ReturnType<typeof rgb> };

/**
 * A span broken to fit a column.
 *
 * Words first, and a word wider than the column on its own is cut mid-word
 * rather than allowed to run into the next column — a laboratory's name is
 * occasionally one unspaced string, and a register that overprints its own rules
 * is worse than one that breaks a word badly.
 */
export function wrap(span: SheetSpan, width: number, fonts: Fonts): Line[] {
  const font = span.bold ? fonts.bold : fonts.regular;
  const size = span.size ?? SIZE.body;
  const colour = COLOURS[span.tone ?? 'ink'];
  const text = winAnsi(span.text).trim();
  if (!text) return [];

  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const lines: string[] = [];
  let current = '';

  const push = (word: string) => {
    if (!current) {
      current = word;
    } else if (fits(`${current} ${word}`)) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  };

  for (const word of text.split(/\s+/)) {
    if (fits(word)) {
      push(word);
      continue;
    }
    // Wider than a column of its own: keep cutting until what is left fits.
    let rest = word;
    while (rest && !fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) push(rest);
  }
  if (current) lines.push(current);

  return lines.map((value) => ({ text: value, font, size, colour }));
}

/** How tall a stack of lines is, set solid at this file's leading. */
export function heightOf(lines: readonly Line[]): number {
  return lines.reduce((sum, line) => sum + line.size * LEADING, 0);
}

/**
 * Draw a stack of wrapped lines from `y` downwards. Returns the y under the last.
 *
 * `y` is the *top* of the block rather than a baseline, because everything that
 * calls this is stacking blocks down a page and none of them wants to think
 * about descenders.
 */
export function drawStack(
  page: PDFPage,
  lines: readonly Line[],
  options: { x: number; y: number; width?: number; align?: 'left' | 'right' },
): number {
  let y = options.y;
  for (const line of lines) {
    y -= line.size * LEADING;
    const x =
      options.align === 'right' && options.width !== undefined
        ? options.x + options.width - line.font.widthOfTextAtSize(line.text, line.size)
        : options.x;
    // The line box's bottom is `y`; the baseline sits a descender above it.
    page.drawText(line.text, {
      x,
      y: y + line.size * 0.22,
      size: line.size,
      font: line.font,
      color: line.colour,
    });
  }
  return y;
}

/** A rule across the page, or across part of it. */
export function drawRule(
  page: PDFPage,
  options: {
    y: number;
    from: number;
    to: number;
    thickness?: number;
    colour?: ReturnType<typeof rgb>;
  },
): void {
  page.drawLine({
    start: { x: options.from, y: options.y },
    end: { x: options.to, y: options.y },
    thickness: options.thickness ?? 0.6,
    color: options.colour ?? HAIRLINE,
  });
}

/**
 * A document being drawn: the fonts, the artwork, and the shape of its pages.
 *
 * Held together so a second and third page cost one call rather than a repeat of
 * the setup, and so the two documents in this folder cannot come to disagree
 * about what size paper they are on.
 */
export type Paper = {
  pdf: PDFDocument;
  fonts: Fonts;
  logo: PDFImage | null;
  /** `[width, height]`, in points, of every page in this document. */
  size: [number, number];
  /** The text width: the page less both margins. */
  width: number;
};

export async function openPaper(landscape = false): Promise<Paper> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const bytes = await readLogo();
  // A logo that will not decode is treated like one that is not there: the sheet
  // is worth more than the mark on it.
  const logo = bytes ? await pdf.embedPng(bytes).catch(() => null) : null;

  const size: [number, number] = landscape ? [A4.height, A4.width] : [A4.width, A4.height];
  return { pdf, fonts, logo, size, width: size[0] - MARGIN * 2 };
}

export async function finishPaper(paper: Paper, head: SheetHead): Promise<Uint8Array> {
  paper.pdf.setTitle(winAnsi(head.title));
  if (head.letterhead.name) paper.pdf.setAuthor(winAnsi(head.letterhead.name));
  return paper.pdf.save();
}

/**
 * The top of every page: the practice's letterhead, and what this sheet is.
 *
 * Deliberately the same arrangement `SheetHead` draws on screen — mark, name,
 * contact details, with the sheet's own title set opposite. A practice has one
 * letterhead, and the fact that this one is drawn in PDF operators and that one
 * in JSX is an implementation detail nobody holding the paper should be able to
 * detect.
 *
 * Returns the y the document may start at.
 */
export function drawLetterhead(page: PDFPage, paper: Paper, head: SheetHead): number {
  const { fonts, logo, width } = paper;
  const top = page.getHeight() - MARGIN;
  let left = top;

  if (logo) {
    // Specified by height, like any letterhead: ~13mm, which is what the
    // practice's own pads use and enough that the hairlines of the script mark
    // survive a laser printer.
    const height = 37;
    const scale = height / logo.height;
    page.drawImage(logo, { x: MARGIN, y: top - height, width: logo.width * scale, height });
    left = top - height;
  }

  if (head.letterhead.name) {
    left -= SIZE.name + 3;
    page.drawText(winAnsi(head.letterhead.name), {
      x: MARGIN,
      y: left,
      size: SIZE.name,
      font: fonts.bold,
      color: INK,
    });
  }

  if (head.letterhead.contact.length > 0) {
    left -= SIZE.small + 4;
    page.drawText(winAnsi(head.letterhead.contact.join('  ·  ')), {
      x: MARGIN,
      y: left,
      size: SIZE.small,
      font: fonts.regular,
      color: SOFT,
    });
  }

  // The title and its one fact, set against the right margin so they line up
  // with the last column rather than floating somewhere near it.
  let right = top - SIZE.title;
  const title = winAnsi(head.title.toUpperCase());
  page.drawText(title, {
    x: MARGIN + width - fonts.bold.widthOfTextAtSize(title, SIZE.title),
    y: right,
    size: SIZE.title,
    font: fonts.bold,
    color: INK,
  });

  if (head.meta) {
    right -= SIZE.body + 5;
    const meta = winAnsi(head.meta);
    page.drawText(meta, {
      x: MARGIN + width - fonts.regular.widthOfTextAtSize(meta, SIZE.body),
      y: right,
      size: SIZE.body,
      font: fonts.regular,
      color: SOFT,
    });
  }

  const bottom = Math.min(left, right) - 9;
  drawRule(page, {
    y: bottom,
    from: MARGIN,
    to: MARGIN + width,
    thickness: 1.2,
    colour: RULE_HEAVY,
  });

  return bottom - 14;
}

/** What this file is and when it was made, along the bottom of the page. */
export function drawFoot(
  page: PDFPage,
  paper: Paper,
  options: { note?: string; label?: string },
): void {
  if (options.note) {
    page.drawText(winAnsi(options.note), {
      x: MARGIN,
      y: MARGIN,
      size: SIZE.foot,
      font: paper.fonts.regular,
      color: FAINT,
    });
  }
  if (options.label) {
    const label = winAnsi(options.label);
    page.drawText(label, {
      x: MARGIN + paper.width - paper.fonts.regular.widthOfTextAtSize(label, SIZE.foot),
      y: MARGIN,
      size: SIZE.foot,
      font: paper.fonts.regular,
      color: FAINT,
    });
  }
}

/**
 * The download itself. `no-store` for the reason `csvResponse` gives: a shared
 * reception machine must not leave a file of patient names and phone numbers in
 * a proxy cache.
 */
export function pdfResponse(fileName: string, bytes: Uint8Array): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
