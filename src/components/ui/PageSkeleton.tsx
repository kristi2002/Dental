/**
 * The shape of a page, shown while the real one is being fetched.
 *
 * Every screen in this app is a server component reading Postgres, and there
 * was no Suspense boundary anywhere — so tapping *Patients* on the reception
 * tablet did nothing visible until the whole page was ready. A tap that
 * produces no response reads as a tap that missed, and the reliable human
 * answer is to tap again.
 *
 * A shape rather than a spinner. The rail and the masthead stay put and stay
 * interactive; only this region is replaced. What is wanted is "the page you
 * asked for is arriving and will look roughly like this", not "wait".
 *
 * ## Why this is not simply dropped in at the group root
 *
 * A `loading.tsx` turns its whole segment into a streaming response, and a
 * streamed response has already committed `200` by the time the page body runs.
 * So any route below it that calls `notFound()` still *renders* the 404 card but
 * answers **200** — verified: with a `loading.tsx` in `patients/`,
 * `/en/patients/<missing-id>` went from 404 to 200, while `plans/` without one
 * stayed 404.
 *
 * That is why this is a component and not a single `(app)/loading.tsx`. The nine
 * segments whose subtrees never call `notFound()` get a `loading.tsx` that
 * renders this. The six that do — `patients`, `plans`, `prescriptions`, `stock`,
 * `works`, `follow-ups` — must not, because their list page and their detail
 * page share one segment and a boundary cannot be scoped to just the list.
 * Those stream from inside their own `page.tsx` instead, which leaves the
 * detail routes' status codes alone.
 *
 * Deliberately wordless. A skeleton that said "Loading…" in three languages
 * would be a slower way of saying the same thing, and a screen reader would
 * announce it on every navigation; the `role="status"` wrapper carries that
 * once instead.
 */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">…</span>

      <div aria-hidden className="animate-pulse">
        {/* The page heading and its one-line subtitle. */}
        <div className="h-9 w-64 max-w-full rounded-lg bg-line-strong/60" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-line-strong/40" />

        {/* And the card almost every one of these screens opens with. */}
        <div className="card mt-6 p-5">
          <div className="space-y-4">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="size-10 shrink-0 rounded-full bg-line-strong/50" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-1/3 rounded bg-line-strong/50" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-line-strong/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The body of a list page, while its rows are on their way.
 *
 * Used as a `<Suspense fallback>` *inside* the six pages that cannot have a
 * `loading.tsx` — so it stands in for the table alone and the real heading
 * above it is already on screen.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">…</span>
      <div aria-hidden className="card animate-pulse p-5">
        <div className="space-y-4">
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="size-10 shrink-0 rounded-full bg-line-strong/50" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-1/3 rounded bg-line-strong/50" />
                <div className="mt-2 h-3 w-1/2 rounded bg-line-strong/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
