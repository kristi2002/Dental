/**
 * Write down what was waiting on the practice this morning.
 *
 * The database half of `lib/digest.ts`, and the whole of the job. It reads the
 * same three sources the reminder board reads — the practice's own errands, the
 * storage room, and the piles that live on other screens — and stores the
 * numbers against the day.
 *
 * **It sends the practice its own board, and only its own board.** For two
 * releases this wrote a row and stopped, with `sentAt` sitting null against a
 * decision nobody had taken: whether the practice should be emailed. The
 * decision has been taken, and what makes it a small one is that the line every
 * job here holds — *it fills a queue a person works down* — is about messages to
 * **patients**. Nothing about a patient is sent by a clock, then or now. This is
 * the practice writing to itself, which `request-alert.ts` already established
 * when a stranger's booking request needed to reach somebody on a Friday
 * evening, and the argument is the same one: a board nobody opens on the
 * morning nobody is in is a board that has not said anything.
 *
 * Sent only when there is something to say, only when a mailer is configured,
 * and only once per morning — `sentAt` is the interlock, and it is written after
 * the provider accepts, so a failure leaves the row ready to be tried again by
 * the next run rather than silently marked done.
 *
 * **Upsert, not insert.** The clock fires this more than once on a bad morning —
 * a container restart, a retried cron, the sidecar coming back after a deploy —
 * and the unique index on `forDay` is what makes that safe. A second run for the
 * same day overwrites with the fresher numbers, which is also the right answer
 * on its own terms: the digest for today should describe today as it stands.
 */

import { EMPTY_DIGEST, digestMail, digestSummary, type DigestCounts } from '@/lib/digest';
import { today } from '@/lib/dates';
import { bellCounts } from '@/lib/follow-ups';
import { sendMail } from '@/lib/messages/mailer';
import { alertRecipient } from '@/lib/messages/request-alert';
import { prisma } from '@/lib/prisma';
import { getClinicProfile, getOpenFollowUps, getStockAlerts } from '@/lib/queries';
import { countEveryPile } from '@/lib/board-elsewhere';
import { stockAlertCounts } from '@/lib/stock-alerts';

/** Read the board as the clock sees it: everything, gated on nobody. */
export async function readDigestCounts(): Promise<DigestCounts> {
  const [followUps, stock, piles] = await Promise.all([
    getOpenFollowUps(),
    getStockAlerts(),
    countEveryPile(),
  ]);

  const bell = bellCounts(followUps);
  const shelf = stockAlertCounts(stock.active);

  return {
    ...EMPTY_DIGEST,
    followUpsOverdue: bell.overdue,
    followUpsToday: bell.today,
    stockOut: shelf.out,
    stockLow: shelf.low,
    ordersLate: shelf.orderLate,
    worksToChase: piles.works,
    requestsWaiting: piles.requests,
    unreadMail: piles.mail,
    unremindedTomorrow: piles.unreminded,
    appointmentsUnclosed: piles.unwritten,
  };
}

export async function composeMorningDigest(): Promise<string> {
  const forDay = today();
  const counts = await readDigestCounts();

  const row = await prisma.practiceDigest.upsert({
    where: { forDay },
    create: { forDay, ...counts },
    // `sentAt` is deliberately not touched on the way through: a re-run later
    // the same morning must neither mark it unsent nor send it a second time.
    update: counts,
    select: { id: true, sentAt: true },
  });

  const summary = digestSummary(counts);
  const sent = row.sentAt ? '' : await mailTheBoard(row.id, counts);

  return `${summary}${sent}`;
}

/**
 * Put this morning's board in the practice's own inbox.
 *
 * Every reason not to send is an ordinary state rather than an error, and each
 * returns quietly: a clear morning has nothing worth an email, a practice that
 * has not configured a mailer keeps working exactly as it did, and one that has
 * filled in no address of its own has nowhere for this to go. The job's summary
 * line says which of those happened, because a digest that silently never
 * arrives is indistinguishable from a clock that has stopped.
 */
async function mailTheBoard(id: string, counts: DigestCounts): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/[/]$/, '') ?? null;
  const mail = digestMail(counts, base ? `${base}/` : null);
  if (!mail) return '';

  // The practice's own address first, then the reply-to a configured deployment
  // certainly has — the same order, and the same function, the booking-request
  // alert picks its recipient with.
  const profile = await getClinicProfile();
  const to = alertRecipient(profile?.email ?? null, process.env.MAIL_REPLY_TO);
  if (!to) return ' — not emailed: no practice address';

  const result = await sendMail({ to, toName: profile?.name ?? '', ...mail });
  if (!result.ok) return ` — not emailed: ${result.failure}`;

  // After the provider accepted it, never before. A row marked sent by a send
  // that failed is the one state this must not be able to reach.
  await prisma.practiceDigest.update({ where: { id }, data: { sentAt: new Date() } });
  return ` — emailed to ${to}`;
}
