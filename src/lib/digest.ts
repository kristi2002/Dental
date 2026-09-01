/**
 * What was waiting on the practice this morning, reduced to numbers.
 *
 * The reminder board answers "what is waiting" for anybody who opens it. This
 * exists for the morning nobody does — and it is the only thing in the app that
 * looks forward on the practice's own behalf rather than a patient's.
 *
 * **Nothing here sends anything, and that is the design rather than a stage of
 * it.** Every job in this app holds the same line — *it fills a queue a person
 * works down* — and a digest that emailed itself would be the first to cross it.
 * So the composer writes a row, the row carries a `sentAt` that stays null, and
 * whether the practice is ever mailed its own board is a decision somebody makes
 * later with a mailer that is actually configured. What this buys today is that
 * the queue starts filling *now*: the day that decision is made, there is a
 * history to send from rather than a feature to start writing.
 *
 * Pure, so the arithmetic and the wording can be tested without a database. The
 * database half is `lib/jobs/digest.ts`.
 */

/** One morning's board, flattened. Mirrors `PracticeDigest` in the schema. */
export type DigestCounts = {
  followUpsOverdue: number;
  followUpsToday: number;
  stockOut: number;
  stockLow: number;
  /**
   * Deliveries promised and never made. **Cuts across** `stockOut` and
   * `stockLow` rather than adding to them — a material is usually empty
   * *because* the order never came — so this is never part of a total.
   */
  ordersLate: number;
  worksToChase: number;
  requestsWaiting: number;
  unreadMail: number;
  /**
   * What is waiting on the send queue.
   *
   * The column is called `unremindedTomorrow` because that is what it counted
   * when it was written — tomorrow's appointments with nobody told — and it is
   * not worth a migration to rename: the number it holds now is the send
   * queue's own, which is the same fact told properly. See the `unreminded`
   * pile in `board-elsewhere.ts` for why the two had to become one count.
   */
  unremindedTomorrow: number;
  appointmentsUnclosed: number;
};

export const EMPTY_DIGEST: DigestCounts = {
  followUpsOverdue: 0,
  followUpsToday: 0,
  stockOut: 0,
  stockLow: 0,
  ordersLate: 0,
  worksToChase: 0,
  requestsWaiting: 0,
  unreadMail: 0,
  unremindedTomorrow: 0,
  appointmentsUnclosed: 0,
};

/**
 * How many things were waiting, counted once each.
 *
 * `ordersLate` is deliberately left out. It is a second fact about rows already
 * counted in `stockOut` and `stockLow`, and a digest whose headline number was
 * larger than the board's badge for the same morning would be the one thing a
 * digest cannot afford to be — a second, disagreeing count of the same day.
 */
export function digestTotal(counts: DigestCounts): number {
  return (
    counts.followUpsOverdue +
    counts.followUpsToday +
    counts.stockOut +
    counts.stockLow +
    counts.worksToChase +
    counts.requestsWaiting +
    counts.unreadMail +
    counts.unremindedTomorrow +
    counts.appointmentsUnclosed
  );
}

/**
 * The parts of the morning that are about *today* rather than about this week.
 *
 * A follow-up past its day, a shelf with nothing on it, an order that never
 * came, and tomorrow's patients who have heard nothing — the last because it is
 * the only item on the board with a deadline that passes tonight.
 *
 * Overlapping by nature, so this counts rows and not reasons: a material that is
 * both empty and late is one problem. `stockOut + ordersLate` would say two, and
 * `Math.max` is the honest floor when the overlap is unknowable from counts
 * alone — it never claims more than certainly exists.
 */
export function urgentTotal(counts: DigestCounts): number {
  return (
    counts.followUpsOverdue +
    Math.max(counts.stockOut, counts.ordersLate) +
    counts.unremindedTomorrow
  );
}

/**
 * The one line recorded against the run.
 *
 * English, and untranslated on purpose: this goes into `JobRun.summary`, whose
 * own doc comment calls it "one line, for the log and for the screen" beside a
 * `description` the registry keeps in English for the same reason. A job's
 * record is read by whoever is debugging the clock, and half the time that is a
 * log file with no locale in it at all.
 *
 * Only the non-zero parts, because a summary that always reads the same length
 * whatever happened is one nobody scans. A clear morning says so in three words.
 */
/**
 * The morning email, or null when there is nothing to say.
 *
 * **English, and that is a decision rather than an oversight.** It is the same
 * one `digestSummary` makes two paragraphs below, for the same reason: a clock
 * has no reader, so there is no locale to compose in — the job runs at seven in
 * the morning with nobody signed in, and guessing at whose screen this will
 * land on is how a practice ends up with a daily email in a language the person
 * reading it does not use. The link at the bottom opens the board, which *is*
 * in the reader's language because by then there is a reader.
 *
 * **Null on a clear morning.** A digest that arrives every day whatever
 * happened is one that is filed unread by the second week, and then the one
 * that matters is filed with it. Nothing waiting is exactly the morning not to
 * send an email about.
 */
export function digestMail(
  counts: DigestCounts,
  /** Where the board is. Omitted when `NEXT_PUBLIC_APP_URL` is unset. */
  boardUrl: string | null,
): { subject: string; text: string } | null {
  const total = digestTotal(counts);
  if (total === 0) return null;

  const urgent = urgentTotal(counts);
  const lines = [
    digestSummary(counts),
    '',
    urgent > 0
      ? `${urgent} of them will not keep until tomorrow.`
      : 'None of it is urgent today.',
  ];

  if (boardUrl) lines.push('', `Open the board: ${boardUrl}`);

  return {
    // The number in the subject line, because that is the whole of what most
    // mornings need to communicate and the only part read on a lock screen.
    subject: `${total} waiting at the practice`,
    text: lines.join('\n'),
  };
}

export function digestSummary(counts: DigestCounts): string {
  const parts: string[] = [];

  // Both forms spelled out rather than a suffixed `s`. Half of these read "1
  // shelf empty" against "3 shelves empty", and a log line that says "1 shelves"
  // is the kind of small wrongness that makes a reader distrust the number
  // beside it.
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };

  add(counts.followUpsOverdue, 'follow-up late', 'follow-ups late');
  add(counts.followUpsToday, 'due today', 'due today');
  add(counts.stockOut, 'shelf empty', 'shelves empty');
  add(counts.stockLow, 'running low', 'running low');
  add(counts.ordersLate, 'delivery late', 'deliveries late');
  add(counts.worksToChase, 'case at the lab', 'cases at the lab');
  add(counts.requestsWaiting, 'booking request', 'booking requests');
  add(counts.unreadMail, 'unread message', 'unread messages');
  add(counts.unremindedTomorrow, 'waiting to send', 'waiting to send');
  add(counts.appointmentsUnclosed, 'appointment unclosed', 'appointments unclosed');

  if (parts.length === 0) return 'Nothing waiting.';

  return `${digestTotal(counts)} waiting — ${parts.join(', ')}`;
}
