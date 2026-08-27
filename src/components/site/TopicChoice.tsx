'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The one piece of state two distant parts of this page share: which treatment
 * the reader has said they are asking about.
 *
 * `ConcernPicker` sits near the top and `RequestForm` is four sections down, and
 * somebody who has just pressed "a tooth is missing" should not have to find
 * *Implants* again in a select box at the bottom of the page. That is the whole
 * feature, and it is small — which is why it is worth being careful about how it
 * is wired.
 *
 * **A provider rather than the alternatives.** Passing it down is impossible:
 * the two components have no common parent that is a client component, only the
 * page. A custom DOM event between them would work and is what a page without a
 * framework would do, but it puts a component's state somewhere React cannot see
 * it and nothing type-checks the wire. Writing to the `<select>` element's
 * `value` directly is fewer lines still and is exactly the sort of reaching into
 * another component's DOM that stops working the day the form becomes
 * controlled.
 *
 * **It does not make the page a client page.** The provider takes `children` as
 * a prop, so everything inside it stays server-rendered and arrives as an
 * already-rendered tree — the boundary is this file, not the sections it wraps.
 * That is the property worth protecting: the storefront's content is in the HTML
 * because a clinic's front page has to be readable on a bad connection, and a
 * context provider is not a reason to give that up.
 *
 * **The default is empty on purpose.** Nothing is preselected, on the server or
 * on the first client render, so the form opens on "I am not sure" for a reader
 * who never touched the picker — and the two renders agree, so there is nothing
 * for hydration to reconcile.
 */
type TopicChoice = {
  /** A `TreatmentKey`, or `''` for "not said". */
  topic: string;
  setTopic: (topic: string) => void;
};

const Context = createContext<TopicChoice | null>(null);

export function TopicProvider({ children }: { children: ReactNode }) {
  const [topic, setTopic] = useState('');

  // Memoised because a fresh object here would be a new context value on every
  // render of this provider, and this provider wraps the entire page — every
  // consumer would re-render for reasons that have nothing to do with the topic.
  // `setTopic` is stable, so the topic itself is the only dependency.
  const value = useMemo(() => ({ topic, setTopic }), [topic]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Throws outside a provider rather than returning a no-op default.
 *
 * A silent fallback here would mean the picker and the form quietly stop talking
 * to each other the day somebody renders one of them outside the storefront
 * layout — working page, missing feature, nothing in any log. This turns that
 * into an error on the first render.
 */
export function useTopicChoice(): TopicChoice {
  const choice = useContext(Context);
  if (!choice) {
    throw new Error('useTopicChoice must be used inside <TopicProvider> — see (site)/layout.tsx');
  }
  return choice;
}
