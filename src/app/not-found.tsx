import Link from 'next/link';
import { routing } from '@/i18n/routing';
import { poppins } from './fonts';
import './globals.css';

/**
 * Reached only for paths the locale middleware never matched (e.g. a stray asset
 * path), so it renders its own document and points back at the default language.
 */
export default function RootNotFound() {
  return (
    <html lang={routing.defaultLocale} className={poppins.variable}>
      <body>
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="card max-w-lg p-8 text-center">
            <h1 className="text-3xl font-bold text-ink">404</h1>
            <p className="mt-2 text-[1.05rem] text-ink-soft">
              Kjo faqe nuk ekziston · This page does not exist · Questa pagina non esiste
            </p>
            <Link href={`/${routing.defaultLocale}`} className="btn btn-primary mt-6">
              DentOrganizer
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
