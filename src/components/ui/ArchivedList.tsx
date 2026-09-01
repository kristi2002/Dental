import { Undo2 } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';

/**
 * The retired rows of a catalogue, folded away at the bottom of its own screen.
 *
 * Four catalogues gained an `archivedAt` at once — treatments, suppliers,
 * standard wording and kinds of laboratory work — because every one of them was
 * hard-delete only while every historical record naming them was `SetNull`. See
 * `Service.archivedAt`, which sets the argument out in full.
 *
 * That left four screens each needing the same closing section, which the
 * storage room had already written once: shut by default, because the point of
 * retiring something is that it stops being part of the daily list; present at
 * all, because "archived by mistake" must not need a database client.
 *
 * Shared rather than copied for the reason the field groups on the patient form
 * are: four copies of a restore button is four places for one of them to be
 * given the wrong action, and the one that is wrong is the one nobody presses
 * until they need it.
 *
 * The stock page keeps its own copy. It shows a quantity beside each name,
 * which is a fact about a material and about nothing else on this list, and
 * bending this into a slot for it would be a parameter used once.
 */
export async function ArchivedList({
  rows,
  action,
  title,
}: {
  rows: ReadonlyArray<{ id: string; name: string; archivedAt: Date | null }>;
  /** The matching `restore…` action. Takes the row's id and nothing else. */
  action: (formData: FormData) => Promise<void>;
  /** "Retired treatments", "Retired suppliers" — the screen's own word for them. */
  title: string;
}) {
  if (rows.length === 0) return null;

  const t = await getTranslations('common');
  const format = await getFormatter();

  return (
    <details className="card mb-6">
      <summary className="cursor-pointer list-none px-5 py-4 text-lead font-bold text-ink">
        {title}
        <span className="ml-2 font-normal text-ink-soft">({rows.length})</span>
      </summary>

      <ul className="divide-y divide-line border-t border-line">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-body font-bold text-ink">{row.name}</p>
              {row.archivedAt ? (
                <p className="text-meta text-ink-soft">
                  {t('archivedOn', {
                    date: format.dateTime(row.archivedAt, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </p>
              ) : null}
            </div>

            <ActionForm action={action} values={{ id: row.id }}>
              <button type="submit" className="btn btn-secondary btn-sm">
                <Undo2 size={17} aria-hidden />
                {t('restore')}
              </button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </details>
  );
}
