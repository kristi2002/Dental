import { CircleCheck, CircleSlash, Send, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { sendTestEmail } from '@/lib/actions/messages';
import { inboundConfigured, mailerStatus } from '@/lib/messages/mailer';

/**
 * Whether the practice can send email, and one button that proves it.
 *
 * The card exists because the failure it guards against is silent. A key that
 * was pasted with a trailing space, a sender domain nobody finished verifying,
 * an SPF record with a typo in it — none of those announce themselves. The
 * provider accepts the message, the app records a send, and the reminder lands
 * in a spam folder for the rest of the year. `backup-status.ts` makes the same
 * argument at greater length about backups, and it is the same argument.
 *
 * What this cannot tell you is whether the key is *right*: only a real send does
 * that, which is what the button is for. So the card says what it knows and no
 * more — "configured" here means the three settings parse, nothing further.
 */
export async function MailerCard({ canEdit }: { canEdit: boolean }) {
  const t = await getTranslations('settings');
  const status = mailerStatus();
  const receiving = inboundConfigured();

  const tone: BadgeTone = status.configured ? 'ok' : status.problem === 'unset' ? 'neutral' : 'warn';
  const icon = status.configured ? (
    <CircleCheck size={17} aria-hidden />
  ) : status.problem === 'unset' ? (
    <CircleSlash size={17} aria-hidden />
  ) : (
    <TriangleAlert size={17} aria-hidden />
  );

  return (
    <div className="space-y-3 px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>
          {icon}
          {status.configured ? t('mailOn') : t(`mailProblem_${status.problem}`)}
        </Badge>
        {status.configured ? (
          <span className="text-[0.93rem] text-ink-soft">
            {t('mailVia', { provider: status.provider })}
          </span>
        ) : null}
      </div>

      {status.configured ? (
        <dl className="grid gap-x-6 gap-y-1 text-[0.95rem] sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-semibold text-ink-soft">{t('mailFrom')}</dt>
          <dd className="font-mono text-[0.88rem] break-all">{status.from}</dd>
          <dt className="font-semibold text-ink-soft">{t('mailReplyTo')}</dt>
          {/* The one optional setting worth nagging about. Unset means replies
              go to the sending address, and a `no-reply@` mailbox is one nobody
              reads — so a patient's "can we move it?" lands nowhere and the
              practice never learns it was asked. */}
          <dd className={status.replyTo ? 'font-mono text-[0.88rem] break-all' : 'text-warn'}>
            {status.replyTo || t('mailReplyToUnset')}
          </dd>
          {/* Sending and receiving are two settings with two failure modes, and
              only one of them announces itself. A practice that never points an
              MX record at the provider gets an inbox that stays empty for ever
              and no reason given — so the reason is given here. */}
          <dt className="font-semibold text-ink-soft">{t('mailInbound')}</dt>
          <dd className={receiving ? undefined : 'text-ink-soft'}>
            {receiving ? t('mailInboundOn') : t('mailInboundOff')}
          </dd>
        </dl>
      ) : (
        <p className="text-[0.98rem] text-ink-soft">{t('mailHint')}</p>
      )}

      {status.configured && canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <ReportingActionForm action={sendTestEmail} values={{}}>
            <button type="submit" className="btn btn-secondary">
              <Send size={18} aria-hidden />
              {t('mailTest')}
            </button>
          </ReportingActionForm>
          <span className="text-[0.9rem] text-ink-faint">
            {t('mailTestHint', { to: status.replyTo ?? status.from })}
          </span>
        </div>
      ) : null}

      <p className="text-[0.9rem] text-ink-faint">{t('mailDnsHint')}</p>
    </div>
  );
}
