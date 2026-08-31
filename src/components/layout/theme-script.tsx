/**
 * The three lines that run before anything is painted.
 *
 * A theme kept in `localStorage` and applied by React is a theme that arrives
 * one frame late, and on this app that frame is a full-screen white flash in a
 * dim surgery — the exact thing somebody turned the evening theme on to stop
 * happening. So the stored choice is replayed synchronously, in `<head>`,
 * before the browser has painted a pixel.
 *
 * It has to be inline for the same reason: an external script is a second
 * round-trip, and a `<script src>` in `<head>` without `async` blocks the paint
 * anyway but arrives later than this does. Allowed by the app's CSP through
 * `'unsafe-inline'`, which is already there for Next's own hydration bootstrap.
 *
 * **It writes nothing when the choice is "system".** No attribute is the third
 * state, not a missing one — `globals.css` matches the machine's preference
 * through `@media (prefers-color-scheme: dark)` whenever `data-theme` is
 * absent, so the correct action for a user who has never chosen is to leave the
 * element alone and let CSS answer. Stamping `data-theme="light"` here would
 * silently opt every new user out of their own operating system's setting.
 *
 * Density rides along in the same script for the same reason: a compact
 * workstation that renders comfortable for one frame and then reflows is a
 * page that jumps under the cursor.
 *
 * `try`/`catch` because `localStorage` throws outright in a locked-down
 * browser rather than returning null, and a theme preference is not worth a
 * blank page.
 */
const SCRIPT =
  `try{var e=document.documentElement,t=localStorage.getItem('theme');` +
  `if(t==='dark'||t==='light'){e.dataset.theme=t}` +
  `if(localStorage.getItem('density')==='compact'){e.dataset.density='compact'}` +
  `}catch(e){}`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
