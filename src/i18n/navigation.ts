import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

/**
 * Re-exported with an explicit annotation on purpose. `redirect` returns `never`,
 * but TypeScript only narrows control flow past a never-returning call when the
 * binding carries an explicit type — without this, every `redirect()` guard
 * would need a dead `throw` after it to satisfy the checker.
 */
export const redirect: typeof navigation.redirect = navigation.redirect;
