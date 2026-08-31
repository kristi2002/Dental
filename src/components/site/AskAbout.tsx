'use client';

import { CalendarCheck } from 'lucide-react';
import { useTopicChoice } from '@/components/site/TopicChoice';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * "Ask about this" — the one control every treatment carries, and the reason it
 * is not a plain link.
 *
 * Pressing it does two things. It goes to the request form, which an ordinary
 * `<a>` would do on its own; and it tells the form *which* treatment the reader
 * was reading about, so the topic box opens on "Implants" rather than on "I am
 * not sure". The second half is the whole point — a reader who has just spent a
 * minute on the implants entry should not have to find the word again in a
 * select box at the end of a form.
 *
 * The topic travels through `TopicChoice`, a context on the storefront layout,
 * which is what lets a button on one page reach a form the layout has not
 * rendered yet. See that file for why it is a context rather than six props or a
 * custom DOM event.
 *
 * **The href is a real route.** `/book` works with no JavaScript at all — the
 * browser loads the booking page and the form is on it. Setting the topic on the
 * way is the one thing that needs a client component here, and it is the only
 * reason this file exists rather than an `<a>` in the server component that
 * renders the treatment.
 *
 * **`setTopic` and the navigation are not racing**, and it is worth saying why,
 * because the answer changed when the drawer became a page. The topic lives in a
 * context on the storefront *layout*, which is above both routes — a client-side
 * navigation between them re-renders the page underneath the provider and leaves
 * its state alone. React runs this `onClick` before the router's own, so the
 * value is set before the form on the other side mounts to read it.
 */
export function AskAbout({
  topic,
  label,
  className,
}: {
  /** A `TreatmentKey`, or any value `REQUEST_TOPICS` accepts. */
  topic: string;
  label: string;
  className?: string;
}) {
  const { setTopic } = useTopicChoice();

  return (
    <Link
      href="/book"
      onClick={() => setTopic(topic)}
      className={cn(
        'group inline-flex min-h-12 items-center gap-2.5 rounded-full bg-gilt px-6 text-body font-bold text-navy no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-gilt-deep motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <CalendarCheck size={18} aria-hidden />
      {label}
    </Link>
  );
}
