import { getTranslations } from 'next-intl/server';
import type { ToothRecordMap } from '@/components/dental/DentalChart';
import { PatientArch, type ArchMark } from '@/components/patients/PatientArch';
import {
  ALL_TEETH,
  dentitionOf,
  headlineStatus,
  NO_FINDINGS,
  quadrantOf,
  toothKind,
  TOOTH_STATUS_STYLE,
  type ToothCondition,
} from '@/lib/teeth';

/**
 * The chart as the person in the chair should see it.
 *
 * The odontogram is an instrument and reads like one — thirty-two numbered
 * cells, a five-surface target under each, eight statuses in a legend, FDI
 * notation throughout. Turning that screen round is the single most common
 * thing a dentist does with it and the one thing it is worst at: a patient sees
 * a spreadsheet of their own mouth and takes away that something is wrong
 * somewhere in it.
 *
 * So this is the same findings, addressed to them: a photograph of two arches,
 * a numbered pin on each tooth being discussed, and one line per pin. Nothing
 * is clickable, nothing can be edited, and nothing is recorded here — it is a
 * way of *showing*, and every decision below comes from that.
 *
 * ## Why the photographs, here of all places
 *
 * `ToothPhoto` is emphatic that the stock artwork cannot be the chart: findings
 * have to be drawn into a tooth and cannot be drawn into a bitmap, the set has
 * no primary teeth, and the poster's proportions are a poster's. Exactly one of
 * those objections survives contact with this screen, because **nothing is
 * drawn into anything here** — the pin sits beside the tooth, which is what a
 * finger does when you point at a picture. The photographs are also simply
 * better at this job than the drawing is: the patient is not reading anatomy,
 * they are being shown their mouth, and a photograph says "your teeth" where a
 * diagram says "teeth in general".
 *
 * ## What is deliberately not here
 *
 * **Surfaces.** "Disto-occlusal" is the difference between a note and a
 * treatment plan for a dentist and is noise to everybody else. The chart keeps
 * them; this does not.
 *
 * **Notes.** They are the clinician's own shorthand, written for the record and
 * not for the patient — "bruksizëm, rekomanduar mbrojtëse nate" is a reminder
 * to a colleague. Showing them here would quietly turn every note field in the
 * app into patient-facing copy, and nobody wrote them that way.
 *
 * **FDI numbers.** The pins count 1, 2, 3 in the order the mouth reads, and the
 * line beside each names the tooth in words. A patient who is told "36" has
 * learned nothing; one who is told "lower left, first molar" can find it with
 * their tongue.
 *
 * ## The baby teeth are listed, not pinned, and it says so
 *
 * The poster never drew the twenty primary teeth, so a finding on one has
 * nowhere to go on the picture. Silently dropping it would be the worst
 * possible failure on this screen in particular: a parent looking at an arch
 * with no pins on it would reasonably conclude nothing was found. They get
 * their own group under the arch instead, named as baby teeth. The list is the
 * content; the arch is the illustration — and that is the division that lets
 * this stay truthful about what it cannot draw.
 */
export async function PatientView({
  name,
  records,
}: {
  name: string;
  records: ToothRecordMap;
}) {
  const t = await getTranslations('patients');
  const tt = await getTranslations('teeth');

  /**
   * One entry per *tooth*, not per finding.
   *
   * A tooth can now carry several — a crown over a root filling is two, and
   * three is ordinary. Pinning each of them separately would put three numbered
   * dots on one tooth and turn the picture into the spreadsheet this screen
   * exists to replace. So the tooth gets one pin in its headline colour and the
   * line beside it names everything on it.
   *
   * In the order the mouth reads, upper right to upper left and then lower,
   * because the pins are numbered in list order and a patient follows them
   * round the arch.
   */
  const findings = ALL_TEETH.map((toothNum) => ({
    toothNum,
    list: records[toothNum]?.findings ?? NO_FINDINGS,
  }))
    .filter((tooth) => tooth.list.length > 0)
    .map((tooth) => ({ ...tooth, status: headlineStatus(tooth.list) }));

  const permanent = findings.filter((f) => dentitionOf(f.toothNum) === 'PERMANENT');
  const primary = findings.filter((f) => dentitionOf(f.toothNum) === 'PRIMARY');

  // Numbered over the pinnable teeth only. Numbering all of them and then
  // pinning some would leave gaps in the arch that read as a rendering fault
  // rather than as the absence of artwork it actually is.
  const marks: ArchMark[] = permanent.map((finding, i) => ({
    toothNum: finding.toothNum,
    index: i + 1,
    status: finding.status,
  }));

  const nameOf = (toothNum: number) => {
    const kind = toothKind(toothNum);
    return `${tt(`quadrant_${quadrantOf(toothNum)}`)}${kind ? ` · ${tt(`name_${kind}`)}` : ''}`;
  };

  return (
    <div className="min-h-full bg-navy px-5 py-8 text-navy-ink sm:px-10 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">{t('patientViewHeading')}</h1>
          <p className="mt-2 text-lg text-navy-ink-soft">{name}</p>
        </header>

        <PatientArch marks={marks} label={t('patientViewArchLabel')} />

        {findings.length === 0 ? (
          // A clean chart is worth saying out loud rather than leaving as an
          // empty space — this is the one screen where the good news has an
          // audience.
          <p className="mx-auto max-w-xl rounded-2xl border border-navy-line bg-navy-soft px-6 py-5 text-center text-lg">
            {t('patientViewNone')}
          </p>
        ) : (
          <div className="space-y-8">
            {permanent.length > 0 ? (
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {permanent.map((finding, i) => (
                  <li
                    key={finding.toothNum}
                    className="flex items-center gap-3.5 rounded-2xl border border-navy-line bg-navy-soft px-4 py-3.5"
                  >
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full text-[1.05rem] font-bold text-white"
                      style={{ backgroundColor: TOOTH_STATUS_STYLE[finding.status].hue }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[1.05rem] font-bold">
                        {finding.list.map((one: ToothCondition) => tt(`status_${one.status}`)).join(' · ')}
                      </span>
                      <span className="block text-[0.95rem] text-navy-ink-soft">
                        {nameOf(finding.toothNum)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            {primary.length > 0 ? (
              <section className="space-y-3">
                {/* Named rather than merged into the list above, because these
                    are the ones the picture cannot show — see the note at the
                    top of this file on why they must not simply vanish. */}
                <h2 className="text-[1.05rem] font-bold text-navy-ink-soft">
                  {t('patientViewBabyTeeth')}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {primary.map((finding) => (
                    <li
                      key={finding.toothNum}
                      className="flex items-center gap-3.5 rounded-2xl border border-navy-line bg-navy-soft px-4 py-3.5"
                    >
                      <span
                        aria-hidden
                        className="size-4 shrink-0 rounded-full"
                        style={{ backgroundColor: TOOTH_STATUS_STYLE[finding.status].hue }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[1.05rem] font-bold">
                          {finding.list.map((one: ToothCondition) => tt(`status_${one.status}`)).join(' · ')}
                        </span>
                        <span className="block text-[0.95rem] text-navy-ink-soft">
                          {nameOf(finding.toothNum)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
