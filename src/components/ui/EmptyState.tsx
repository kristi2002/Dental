import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      {icon ? <span className="text-line-strong">{icon}</span> : null}
      <p className="max-w-md text-[1.05rem] text-ink-soft">{title}</p>
      {action}
    </div>
  );
}
