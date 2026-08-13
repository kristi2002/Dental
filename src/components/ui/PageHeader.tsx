import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/layout/Breadcrumbs';

export function PageHeader({
  title,
  subtitle,
  actions,
  trail,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /**
   * The path back out, dashboard excluded — `Breadcrumbs` prepends it. Omitted
   * on the dashboard itself, which is the root and has nothing to climb to.
   */
  trail?: Crumb[];
}) {
  return (
    <>
      {trail ? <Breadcrumbs items={trail} /> : null}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-[1.05rem] text-ink-soft">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    </>
  );
}
