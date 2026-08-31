/**
 * Write down what was waiting on the practice this morning.
 *
 * The database half of `lib/digest.ts`, and the whole of the job. It reads the
 * same three sources the reminder board reads — the practice's own errands, the
 * storage room, and the piles that live on other screens — and stores the
 * numbers against the day.
 *
 * **It sends nothing.** That is not a stage this is passing through: it is the
 * line every job in this app holds, written out in the registry's own words —
 * *"it fills a queue a person works down"*. The row's `sentAt` exists, stays
 * null, and whether the practice is ever emailed its own board is somebody's
 * decision later, with a mailer that is actually pointed at a real domain. What
 * this job buys today is that the queue starts filling *now*, so that decision
 * arrives with a history behind it rather than a blank table.
 *
 * **Upsert, not insert.** The clock fires this more than once on a bad morning —
 * a container restart, a retried cron, the sidecar coming back after a deploy —
 * and the unique index on `forDay` is what makes that safe. A second run for the
 * same day overwrites with the fresher numbers, which is also the right answer
 * on its own terms: the digest for today should describe today as it stands.
 */

import { EMPTY_DIGEST, digestSummary, type DigestCounts } from '@/lib/digest';
import { today } from '@/lib/dates';
import { bellCounts } from '@/lib/follow-ups';
import { prisma } from '@/lib/prisma';
import { getOpenFollowUps, getStockAlerts } from '@/lib/queries';
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

  await prisma.practiceDigest.upsert({
    where: { forDay },
    create: { forDay, ...counts },
    // `sentAt` is deliberately not touched on the way through. If anything ever
    // does send one of these, a re-run later the same morning must not quietly
    // mark it unsent again.
    update: counts,
  });

  return digestSummary(counts);
}
