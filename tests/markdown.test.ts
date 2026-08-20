import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  excerpt,
  parseInline,
  parseMarkdown,
  plainText,
  safeHref,
  type Span,
} from '../src/lib/markdown';

/** Flatten a span tree to the text it prints, for the structural assertions. */
function textOf(spans: Span[]): string {
  return spans
    .map((span) =>
      span.kind === 'text' ? span.text : span.kind === 'break' ? '\n' : textOf(span.spans),
    )
    .join('');
}

describe('safeHref — what is allowed to become a link', () => {
  it('keeps the three schemes a clinic note legitimately carries', () => {
    assert.equal(safeHref('https://lab.example/order'), 'https://lab.example/order');
    assert.equal(safeHref('http://lab.example'), 'http://lab.example');
    assert.equal(safeHref('mailto:lab@example.com'), 'mailto:lab@example.com');
  });

  it('rewrites a bare host rather than treating it as a path inside the app', () => {
    assert.equal(safeHref('www.example.com/x'), 'https://www.example.com/x');
  });

  it('refuses the schemes that turn a note into a script', () => {
    assert.equal(safeHref('javascript:alert(1)'), null);
    assert.equal(safeHref('JavaScript:alert(1)'), null);
    assert.equal(safeHref('data:text/html,<script>'), null);
    assert.equal(safeHref('vbscript:x'), null);
  });

  it('refuses a relative path, which would point back inside the app', () => {
    assert.equal(safeHref('/patients/123'), null);
    assert.equal(safeHref(''), null);
    assert.equal(safeHref('   '), null);
  });
});

describe('parseInline — emphasis, links and line breaks', () => {
  it('leaves an ordinary sentence as one span', () => {
    const spans = parseInline('Ring the lab about the bridge.');
    assert.deepEqual(spans, [{ kind: 'text', text: 'Ring the lab about the bridge.' }]);
  });

  it('reads bold and italic', () => {
    assert.equal(parseInline('**now**')[0]?.kind, 'bold');
    assert.equal(parseInline('*maybe*')[0]?.kind, 'italic');
  });

  it('does not mistake the opening of a bold run for an italic one', () => {
    const spans = parseInline('**both words**');
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.kind, 'bold');
    assert.equal(textOf(spans), 'both words');
  });

  it('styles inside a link label', () => {
    const spans = parseInline('[the **urgent** one](https://example.com)');
    assert.equal(spans[0]?.kind, 'link');
    assert.equal(textOf(spans), 'the urgent one');
  });

  it('prints an unsafe link as the text somebody typed instead of dropping it', () => {
    const spans = parseInline('[click](javascript:alert(1))');
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.kind, 'text');
    assert.equal(textOf(spans), '[click](javascript:alert(1))');
  });

  it('links a pasted address without any markup', () => {
    const spans = parseInline('see https://lab.example/x now');
    const link = spans.find((span) => span.kind === 'link');
    assert.ok(link && link.kind === 'link');
    assert.equal(link.href, 'https://lab.example/x');
  });

  it('leaves the full stop out of an address that ends a sentence', () => {
    const spans = parseInline('order at www.example.com.');
    const link = spans.find((span) => span.kind === 'link');
    assert.ok(link && link.kind === 'link');
    assert.equal(link.href, 'https://www.example.com');
    assert.equal(textOf(spans), 'order at www.example.com.');
  });

  it('keeps a single newline, because somebody typing two lines means two', () => {
    const spans = parseInline('first\nsecond');
    assert.equal(spans.filter((span) => span.kind === 'break').length, 1);
  });

  it('leaves an unclosed marker alone rather than eating the rest of the note', () => {
    assert.equal(textOf(parseInline('2 ** 3 is not bold')), '2 ** 3 is not bold');
    assert.equal(textOf(parseInline('a * b')), 'a * b');
  });
});

describe('parseMarkdown — the block structure', () => {
  it('splits paragraphs on a blank line', () => {
    const blocks = parseMarkdown('one\n\ntwo');
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0]?.kind, 'paragraph');
    assert.equal(blocks[1]?.kind, 'paragraph');
  });

  it('reads a dashed list', () => {
    const blocks = parseMarkdown('- shade\n- bite\n- contact point');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.kind, 'bullets');
    assert.equal(blocks[0]?.kind === 'bullets' ? blocks[0].items.length : 0, 3);
  });

  it('reads a numbered list', () => {
    const blocks = parseMarkdown('1. ring\n2. confirm');
    assert.equal(blocks[0]?.kind, 'numbers');
  });

  it('treats a change of marker as a second list', () => {
    const blocks = parseMarkdown('- one\n1. two');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['bullets', 'numbers'],
    );
  });

  it('keeps a paragraph and the list under it apart', () => {
    const blocks = parseMarkdown('Check before ringing:\n- shade\n- bite');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['paragraph', 'bullets'],
    );
  });

  it('returns nothing for an empty note', () => {
    assert.deepEqual(parseMarkdown(''), []);
    assert.deepEqual(parseMarkdown('\n\n  \n'), []);
  });
});

describe('plainText — what the bell and the row print', () => {
  it('takes the markers off', () => {
    assert.equal(plainText('**ring** the *lab*'), 'ring the lab');
  });

  it('keeps the label of a link, not its target', () => {
    assert.equal(plainText('[the order](https://example.com/x)'), 'the order');
  });

  it('joins a list into one readable line', () => {
    assert.equal(plainText('- shade\n- bite'), 'shade · bite');
  });

  it('collapses the whitespace a multi-line note carries', () => {
    assert.equal(plainText('one\n\ntwo\nthree'), 'one two three');
  });
});

describe('excerpt — one line, cut to length', () => {
  it('leaves a short note alone', () => {
    assert.equal(excerpt('ring the lab'), 'ring the lab');
  });

  it('cuts on a word and marks the cut', () => {
    const long = 'ring the laboratory about the bridge for Berisha before Friday afternoon';
    const cut = excerpt(long, 20);
    assert.ok(cut.length <= 21, cut);
    assert.ok(cut.endsWith('…'));
    assert.ok(!cut.includes('  '));
  });

  it('cuts mid-word rather than returning almost nothing', () => {
    assert.ok(excerpt('Supercalifragilistic', 10).startsWith('Supercalif'));
  });
});
