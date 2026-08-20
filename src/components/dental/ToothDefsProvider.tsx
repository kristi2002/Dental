'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { TOOTH_DEFS } from '@/components/dental/ToothGlyph';

/**
 * One copy of the tooth drawings per page, without making every page remember.
 *
 * `ToothDefs` is 2,162 elements and about 450KB of markup. Every `ToothGlyph`
 * points into it by id, which browsers resolve document-wide the way an icon
 * sprite does — so one copy is all a page can *use*, and a second is pure
 * weight plus a document full of duplicate ids.
 *
 * Three components mounted their own, because each has to work standing alone:
 * the chart, the visit timeline, and the tooth picker. On the patient page all
 * three are on screen together, so that page was shipping three copies — six
 * and a half thousand redundant nodes — with `url(#…)` quietly resolving to
 * whichever happened to come first.
 *
 * So: wrap a subtree in `ToothDefsProvider` and the copies inside it collapse
 * to the provider's one. Leave a picker in a dialog on some page nobody thought
 * about and it still brings its own, and still draws. The page opts in to the
 * saving; it does not opt in to the drawing working.
 *
 * Context rather than a module-level flag, because module scope is shared
 * across requests on the server: a flag would have one request's render
 * suppress the defs for the next request that came along.
 */
const ToothDefsContext = createContext(false);

export function ToothDefsProvider({ children }: { children: ReactNode }) {
  return (
    <ToothDefsContext.Provider value>
      {TOOTH_DEFS}
      {children}
    </ToothDefsContext.Provider>
  );
}

/**
 * The defs, unless something above already put them on the page.
 *
 * Client-only, which is the reason this is its own file — `ToothGlyph` is
 * imported by a server component, and a hook in there would drag every gradient
 * and modelled tooth into the client bundle.
 */
export function ToothDefs() {
  return useContext(ToothDefsContext) ? null : TOOTH_DEFS;
}
