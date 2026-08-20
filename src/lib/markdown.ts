/**
 * The small subset of Markdown a practice note actually uses.
 *
 * A follow-up used to be one line in a textarea, and the moment it grew
 * attachments and a screen of its own it wanted structure: three things to check
 * before ringing the lab, a link to the supplier, the bit that matters in bold.
 *
 * **Why not a rich text editor.** The obvious answer is TipTap or Lexical, and
 * both are wrong here for the same two reasons. They store HTML, which would put
 * a sanitiser and a `dangerouslySetInnerHTML` between a receptionist's typing
 * and a medical record — the one place in this app where an injection would be
 * worth having. And they are hundreds of kilobytes of editor in a bundle whose
 * whole dependency list is nine packages, for a notes field.
 *
 * Markdown gives the same thing away for nothing. The stored value stays plain
 * text, so it needs no migration, it degrades to something readable everywhere
 * that prints it raw (the bell, an export, a database row somebody is reading in
 * `psql`), and the renderer builds React elements from this tree rather than
 * injecting markup — which is why there is no XSS surface to sanitise in the
 * first place.
 *
 * Everything here is pure and free of React, so `tests/markdown.test.ts` can
 * exercise it directly.
 */

/** A run of inline content inside one block. */
export type Span =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; spans: Span[] }
  | { kind: 'italic'; spans: Span[] }
  | { kind: 'link'; href: string; spans: Span[] }
  /** A single newline inside a paragraph, which people mean literally. */
  | { kind: 'break' };

export type Block =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'bullets'; items: Span[][] }
  | { kind: 'numbers'; items: Span[][] };

/**
 * Schemes a link is allowed to carry.
 *
 * An allowlist, and the reason this module can hand an `href` straight to an
 * anchor: `javascript:` and `data:` are the two that turn a note somebody typed
 * into a script somebody else runs, and no amount of escaping elsewhere helps if
 * the URL itself is the payload. Anything not on this list is not a link — the
 * text is kept and printed as it was written, which is both safe and honest.
 */
const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'];

/**
 * The `href` to put on an anchor, or null when the target is not one we will
 * open. A bare `www.` host is the one rewrite: people type it constantly, and
 * treating it as a relative path would point at a page inside the app.
 */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;

  const lower = url.toLowerCase();
  if (SAFE_SCHEMES.some((scheme) => lower.startsWith(scheme))) return url;
  if (lower.startsWith('www.')) return `https://${url}`;

  return null;
}

/** `[label](target)` — the label may itself be styled. */
const LINK = /^\[([^\]\n]*)\]\(([^)\s]+)\)/;
/** Bare URLs, so a pasted address is clickable without anybody marking it up. */
const AUTOLINK = /^(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/i;
const BOLD = /^\*\*([\s\S]+?)\*\*/;
/** Single asterisk, and never the one that opened a `**` — see the guard below. */
const ITALIC = /^\*(?!\*)([^*\n]+)\*/;

/**
 * Inline content, left to right.
 *
 * Plain text accumulates in a buffer and is flushed whenever a marker matches,
 * which keeps the common case — a sentence with no formatting in it at all — a
 * single pass with one allocation.
 */
export function parseInline(source: string): Span[] {
  const spans: Span[] = [];
  let text = '';
  let rest = source;

  const flush = () => {
    if (text) {
      spans.push({ kind: 'text', text });
      text = '';
    }
  };

  while (rest) {
    if (rest[0] === '\n') {
      flush();
      spans.push({ kind: 'break' });
      rest = rest.slice(1);
      continue;
    }

    // Only ever attempted at a character that could open a marker, so an
    // ordinary sentence never runs four regexes per letter.
    if (rest[0] === '[' || rest[0] === '*' || rest[0] === 'h' || rest[0] === 'w') {
      const link = LINK.exec(rest);
      if (link) {
        const href = safeHref(link[2]);
        if (href) {
          flush();
          spans.push({ kind: 'link', href, spans: parseInline(link[1]) });
        } else {
          // An unusable target is not a link and must not silently vanish: the
          // whole thing goes back into the buffer as the text somebody typed,
          // rather than being pushed as a span of its own, so it merges with
          // whatever surrounds it instead of splitting the sentence in three.
          text += link[0];
        }
        rest = rest.slice(link[0].length);
        continue;
      }

      const bold = BOLD.exec(rest);
      if (bold) {
        flush();
        spans.push({ kind: 'bold', spans: parseInline(bold[1]) });
        rest = rest.slice(bold[0].length);
        continue;
      }

      const italic = ITALIC.exec(rest);
      if (italic) {
        flush();
        spans.push({ kind: 'italic', spans: parseInline(italic[1]) });
        rest = rest.slice(italic[0].length);
        continue;
      }

      const auto = AUTOLINK.exec(rest);
      if (auto) {
        // A URL at the end of a sentence takes the full stop with it otherwise.
        const raw = auto[0].replace(/[.,;:!?]+$/, '');
        const href = safeHref(raw);
        if (href) {
          flush();
          spans.push({ kind: 'link', href, spans: [{ kind: 'text', text: raw }] });
          rest = rest.slice(raw.length);
          continue;
        }
      }
    }

    text += rest[0];
    rest = rest.slice(1);
  }

  flush();
  return spans;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Blocks, from the line structure.
 *
 * A blank line separates paragraphs; a single newline inside one is a break,
 * because somebody typing three lines of a checklist into a note means three
 * lines and would be baffled to get one. That is a deliberate departure from
 * CommonMark, which joins them — this is a notes field, not a document format.
 */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];
  let list: { kind: 'bullets' | 'numbers'; items: string[] } | null = null;

  const closeParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  const closeList = () => {
    if (!list) return;
    blocks.push({ kind: list.kind, items: list.items.map(parseInline) });
    list = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBER.exec(line);

    if (bullet || numbered) {
      closeParagraph();
      const kind = bullet ? 'bullets' : 'numbers';
      // A list that changes marker mid-way is two lists, which is what somebody
      // switching from dashes to numbers is doing.
      if (list && list.kind !== kind) closeList();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  closeParagraph();
  closeList();

  return blocks;
}

/**
 * The note with its markers taken off, for every place that prints one line of
 * it and cannot render a tree: the bell, a list row, an audit summary.
 *
 * Without this, a note reading `**ring the lab**` shows its asterisks in the
 * badge — which is exactly the tell that would make the feature feel bolted on.
 */
function spansToText(spans: Span[]): string {
  return spans
    .map((span) => {
      switch (span.kind) {
        case 'text':
          return span.text;
        case 'break':
          return ' ';
        default:
          return spansToText(span.spans);
      }
    })
    .join('');
}

export function plainText(source: string): string {
  return parseMarkdown(source)
    .map((block) =>
      block.kind === 'paragraph'
        ? spansToText(block.spans)
        : block.items.map(spansToText).join(' · '),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One line of a note, cut to length on a word where it can be. */
export function excerpt(source: string, max = 140): string {
  const text = plainText(source);
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
