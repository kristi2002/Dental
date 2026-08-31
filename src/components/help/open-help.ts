'use client';

/**
 * How anything on a screen asks the help panel to open.
 *
 * The panel is mounted once, in the shell, and never unmounts — so the problem
 * is not rendering it but reaching it from a button several components away.
 * A window event is the whole mechanism: no context provider threaded through
 * the layout, no store, and nothing for a server component to have to become a
 * client component in order to import.
 *
 * Deliberately *not* a navigation. An earlier sketch had the search box send
 * somebody to a screen and open its help on arrival, which meant racing the
 * router: the panel closes itself whenever the path changes, so an open
 * requested before the navigation settled was closed again by its own
 * housekeeping. Showing the topic where they already stand avoids the race
 * entirely, and is the better answer anyway — somebody comparing recalls with
 * reminders wants to read about both without leaving the list they are working.
 */

export const OPEN_HELP = 'app:open-help';

/**
 * Open the help panel.
 *
 * With no argument it explains the screen the reader is on. With a topic id it
 * explains that one instead, wherever they happen to be standing.
 */
export function openHelp(topicId?: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_HELP, { detail: topicId ?? null }));
}
