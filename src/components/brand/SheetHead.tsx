import type { ReactNode } from 'react';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { clinicDisplayName, type ClinicProfile } from '@/lib/queries';

/**
 * The top of anything this practice prints.
 *
 * Every sheet in the app used to head itself: the prescription wrote the clinic
 * name in one size, the treatment plan wrote it in another and in small caps,
 * and the pair disagreed about whether the date belonged in the header at all.
 * Three sheets, three letterheads, and nothing that could put the logo on all of
 * them at once — which is what this exists to fix. A practice has one letterhead.
 *
 * What it prints is what the clinic's own pads print: the mark, the name under
 * it, and the ways to make contact. Nothing here is decoration — a prescription
 * or a lab docket is read by somebody who is not in the building, and the header
 * is how they get back to it.
 *
 * Blank fields are omitted rather than printed empty, so a practice that has
 * filled in none of the letterhead gets a clean logo-and-name header rather
 * than a row of orphaned separators. See `ClinicProfile` in the schema.
 */
export function SheetHead({
  profile,
  title,
  meta,
}: {
  profile: ClinicProfile;
  /** What this particular sheet is — "Prescription", "Lab docket". */
  title?: string;
  /** The one fact that belongs level with the mark, usually a date. */
  meta?: ReactNode;
}) {
  // Joined here rather than in the markup so the separators fall between the
  // details that exist, which is not something a chain of `&&` in JSX gets right
  // without either a stray middot or a wrapper per field.
  const contact = [profile.phone, profile.email, profile.address]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  // Blank on a practice that has filled in neither Settings nor the deploy
  // variable, and printed as blank: a sheet that goes out of the building with
  // a product's name where the practice's should be is worse than one with a
  // mark and no caption. See `clinicDisplayName`.
  const name = clinicDisplayName(profile);

  return (
    <header className="mb-5 flex items-start justify-between gap-6 border-b-2 border-line pb-4">
      <div className="min-w-0">
        {/* Sized by height, like any letterhead: about 15mm on paper, which is
            what the clinic's own pads use and is enough for the hairlines of the
            script `sh` to survive a 300dpi laser printer.

            The name is written beside it rather than left to the mark, because
            the mark is artwork — it is what makes the sheet recognisable at
            arm's length, not what a pharmacist reads to check who prescribed
            this. So the logo is decorative here, and says so. */}
        <ClinicLogo alt="" className="h-14 w-auto" />

        {name ? (
          <p className="mt-2 text-[1.15rem] leading-tight font-bold text-ink">{name}</p>
        ) : null}

        {contact.length > 0 ? (
          <p className="mt-1 text-[0.9rem] leading-snug text-ink-soft">
            {contact.join(' · ')}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        {title ? (
          <p className="text-[1rem] font-bold tracking-wide text-ink-faint uppercase">{title}</p>
        ) : null}
        {meta ? <p className="mt-1 text-[0.95rem] text-ink-soft">{meta}</p> : null}
      </div>
    </header>
  );
}
