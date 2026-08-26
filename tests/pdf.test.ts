import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { winAnsi } from '../src/lib/pdf';
import { renderDocket } from '../src/lib/pdf-docket';
import { renderSheet, type SheetRow } from '../src/lib/pdf-sheet';

describe('winAnsi — what the standard fonts can actually draw', () => {
  it('leaves the alphabet this practice writes in alone', () => {
    // Both of these are in Latin-1, so they are encodable, so folding them would
    // be the bug rather than the fix.
    assert.equal(winAnsi('Enkeleda Çela'), 'Enkeleda Çela');
    assert.equal(winAnsi('Dhëmbët — provë e dentinës'), 'Dhëmbët — provë e dentinës');
    assert.equal(winAnsi('Perché è così'), 'Perché è così');
  });

  it('strips the accent off a letter the encoding has no room for', () => {
    // A Turkish surname in the register is one export, not one 500.
    assert.equal(winAnsi('Şükrü'), 'Sükrü');
    assert.equal(winAnsi('Erdoğan'), 'Erdogan');
  });

  it('folds the Latin letters that stripping accents does not reach', () => {
    assert.equal(winAnsi('Yılmaz'), 'Yilmaz');
    assert.equal(winAnsi('Wałęsa'), 'Walesa');
  });

  it('marks what it genuinely cannot write rather than dropping it', () => {
    // Visibly wrong, on purpose: whoever is holding the sheet can see there is a
    // character missing and go and look it up.
    assert.equal(winAnsi('Иван'), '????');
  });

  it('flattens the whitespace a cell cannot lay out', () => {
    // A cell is drawn line by line by the caller, so a newline inside one run
    // would print one line on top of another.
    assert.equal(winAnsi('Kolori A2\nprova të enjten'), 'Kolori A2 prova të enjten');
  });
});

const COLUMNS = [
  { header: 'Dërguar', width: 8 },
  { header: 'Pacienti', width: 20 },
  { header: 'El.', width: 5, align: 'right' as const },
  { header: 'Punimi', width: 24 },
];

const row = (sent: string, patient: string, elements: string, procedure: string): SheetRow => ({
  opensGroup: true,
  cells: [
    [{ text: sent }],
    [{ text: patient, bold: true }],
    [{ text: elements }],
    [{ text: procedure }],
  ],
});

const spec = (rows: SheetRow[]) => ({
  letterhead: { name: 'Shehu Dental', contact: ['Cel: +355 69 65 84 447'] },
  title: 'Regjistri i punimeve',
  meta: 'Muaji: gusht 2026',
  columns: COLUMNS,
  rows,
  total: { label: 'Totali i elementeve', value: '94', column: 2 },
  pageLabel: (page: number, pages: number) => `Faqja ${page} nga ${pages}`,
  emptyNote: 'Bosh',
  landscape: true,
});

describe('renderSheet — the register on paper', () => {
  it('produces a PDF, and one page is enough for a short month', async () => {
    const bytes = await renderSheet(spec([row('03.08', 'Ylli Berisha', '6', 'Zirkon')]));
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });

  it('puts the practice’s mark on the letterhead', async () => {
    // The reason this sheet exists rather than a second CSV: it is a document
    // from this practice, not a table out of some software. A logo that quietly
    // failed to load would still render a perfectly valid — and quite anonymous
    // — PDF, so the artwork is checked for rather than assumed.
    const doc = await PDFDocument.load(await renderSheet(spec([row('03.08', 'Ylli Berisha', '6', 'Zirkon')])));
    const resources = doc.getPage(0).node.Resources();
    const images = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    assert.ok(images && images.keys().length > 0, 'the letterhead carries no artwork');
  });

  it('still prints a page when the register is empty', async () => {
    // A zero-page PDF is a broken download, not an empty register.
    const bytes = await renderSheet({ ...spec([]), total: undefined });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });

  it('breaks onto further pages rather than off the bottom of the first', async () => {
    const rows = Array.from({ length: 120 }, (_, index) =>
      row('03.08', `Pacienti ${index}`, String(index), 'Metal-porcelan'),
    );
    assert.ok((await PDFDocument.load(await renderSheet(spec(rows)))).getPageCount() > 1);
  });

  it('draws a name no encoding can hold rather than throwing on it', async () => {
    // The whole point of `winAnsi`: one such name must not take the export down.
    const bytes = await renderSheet(spec([row('03.08', 'Şükrü Yılmaz — Иван', '3', 'Faseta')]));
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  });

  it('breaks a word too long for its column instead of running into the next', async () => {
    // A laboratory's name is occasionally one unspaced string. Nothing to assert
    // about the pixels here; what is being pinned is that the wrap terminates.
    const bytes = await renderSheet(spec([row('03.08', 'x'.repeat(400), '1', 'y'.repeat(400))]));
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
  });
});

const DOCKET = {
  letterhead: { name: 'Shehu Dental', contact: ['Cel: +355 69 65 84 447'] },
  title: 'Fletë pune',
  meta: 'Rasti 1045',
  fields: [
    { label: 'Data e fillimit', value: '14.08.2026' },
    { label: 'Laboratori', value: 'Dentart' },
    { label: 'Pacienti', value: 'Ahmedin Zuloj', wide: true },
    { label: 'Mosha', value: '54 vjeç' },
    // Ruled and left for a pen — nothing in the register holds the shade.
    { label: 'Kolori', value: '' },
  ],
  work: {
    headers: { procedure: 'Lloji i punimit', teeth: 'Dhëmbët', elements: 'El.' },
    lines: [{ procedure: 'Urë metal-porcelan', teeth: '17, 16x, 15', elements: '3' }],
    total: { label: 'Totali i elementeve', value: '3' },
  },
  positions: [
    { toothNum: 17, pontic: false },
    { toothNum: 16, pontic: true },
    { toothNum: 15, pontic: false },
  ],
  stages: ['Pronë metali', 'Provë dentine', 'Përfundim', 'Lugë individuale'],
  stageTime: 'Ora',
  pageLabel: (page: number, pages: number) => `Faqja ${page} nga ${pages}`,
};

describe('renderDocket — the slip that travels with the case', () => {
  it('fits one case on one page, with the mark on it', async () => {
    const doc = await PDFDocument.load(await renderDocket(DOCKET));
    assert.equal(doc.getPageCount(), 1);
    const images = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    assert.ok(images && images.keys().length > 0, 'the docket carries no letterhead artwork');
  });

  it('takes a second page rather than running off the bottom of the first', async () => {
    // A case is capped at forty items, and forty will not fit on one slip.
    const lines = Array.from({ length: 40 }, (_, index) => ({
      procedure: `Kurorë zirkoni me shtresë qeramike ${index}`,
      teeth: '17, 16x, 15, 14x, 13',
      elements: '5',
    }));
    const doc = await PDFDocument.load(
      await renderDocket({ ...DOCKET, work: { ...DOCKET.work, lines } }),
    );
    assert.ok(doc.getPageCount() > 1, 'forty items were squeezed onto one page');
  });

  it('draws a case with nothing optional on it', async () => {
    // No urgent flag, no notes, no teeth, no stage lines: a repair, sent out.
    const bytes = await renderDocket({
      ...DOCKET,
      urgent: undefined,
      notes: undefined,
      stages: [],
      positions: [],
      work: {
        ...DOCKET.work,
        lines: [{ procedure: 'Riparim protezë', teeth: '', elements: '1' }],
      },
    });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });

  it('draws a name no encoding can hold rather than throwing on it', async () => {
    const bytes = await renderDocket({
      ...DOCKET,
      fields: [{ label: 'Pacienti', value: 'Şükrü Yılmaz — Иван', wide: true }],
    });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  });
});
