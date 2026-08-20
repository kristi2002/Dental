import { Fragment } from 'react';
import { parseMarkdown, type Block, type Span } from '@/lib/markdown';
import { cn } from '@/lib/utils';

/**
 * A note, rendered.
 *
 * React elements built from the tree in `markdown.ts` — never a string of HTML
 * handed to `dangerouslySetInnerHTML`. That is the whole security argument for
 * doing it this way: there is no markup to sanitise, because none is ever
 * produced. A note reading `<script>` renders the five characters `<script>`,
 * the same as any other text, without anything having to strip it.
 *
 * Deliberately *not* a server component (no `async`, no `next-intl/server`), so
 * the editor's live preview can render the same tree on the client and the two
 * cannot drift apart.
 */

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => (
        <Fragment key={index}>
          {span.kind === 'text' ? (
            span.text
          ) : span.kind === 'break' ? (
            <br />
          ) : span.kind === 'bold' ? (
            <strong className="font-bold text-ink">
              <Spans spans={span.spans} />
            </strong>
          ) : span.kind === 'italic' ? (
            <em>
              <Spans spans={span.spans} />
            </em>
          ) : (
            // Every link in a note points outward — `safeHref` has already
            // refused anything that is not http, https or mailto, so a relative
            // path back into the app cannot reach this. `noreferrer` because a
            // supplier's site has no business being told which screen of a
            // patient record somebody was on.
            <a
              href={span.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              <Spans spans={span.spans} />
            </a>
          )}
        </Fragment>
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'paragraph') {
    return (
      <p>
        <Spans spans={block.spans} />
      </p>
    );
  }

  const List = block.kind === 'bullets' ? 'ul' : 'ol';

  return (
    <List
      className={cn(
        'ms-5 space-y-1',
        block.kind === 'bullets' ? 'list-disc' : 'list-decimal',
      )}
    >
      {block.items.map((item, index) => (
        <li key={index}>
          <Spans spans={item} />
        </li>
      ))}
    </List>
  );
}

export function MarkdownText({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;

  return (
    <div className={cn('space-y-2 break-words', className)}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
