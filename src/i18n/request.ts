import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    // Appointment days are stored at UTC midnight, so formatting in UTC keeps the
    // rendered day identical on the server and in the browser.
    timeZone: 'UTC',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
