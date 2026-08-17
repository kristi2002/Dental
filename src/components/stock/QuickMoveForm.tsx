'use client';

import { Check, Minus, PackageMinus, PackagePlus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { moveStock } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/** The amounts a storage room actually moves, as one tap each. */
const QUICK = [1, 2, 3, 5, 10];

/**
 * What a scanned shelf label opens: how many boxes, and which way.
 *
 * Built for one hand and a phone at a cupboard. Everything is large, nothing is
 * nested, and there is no keyboard in the common path — the amount is set by
 * tapping a number or pressing plus.
 *
 * **There is no direction toggle, on purpose.** A mode switch left the wrong way
 * round turns a delivery into a consumption, silently, and the person doing it
 * is looking at a box rather than at the screen. So the direction is not a state
 * at all: the amount is chosen first and then the verb is pressed, and the two
 * buttons say what they will do. Wrong-direction moves stop being possible
 * rather than being made unlikely.
 */
export function QuickMoveForm({
  itemId,
  onHand,
  canEdit,
}: {
  itemId: string;
  /** What the shelf says right now, so taking out can refuse before the round trip. */
  onHand: number;
  canEdit: boolean;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  const [quantity, setQuantity] = useState(1);
  /** What was just committed, kept only to say so — the count itself is re-read from the server. */
  const [done, setDone] = useState<{ out: boolean; quantity: number } | null>(null);

  const { state, formAction, formRef } = useRecoveredForm(moveStock);
  const pending = useRef<{ out: boolean; quantity: number } | null>(null);
  const handledTs = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;

    // The action revalidates, so the count above this form has already been
    // re-rendered from the database by the time this runs. All that is left to
    // say is which way it moved and by how much, which only the browser knows —
    // and the amount resets, because the next box is a fresh decision.
    setDone(pending.current);
    setQuantity(1);
  }, [state]);

  if (!canEdit) return null;

  const short = quantity > onHand;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="card space-y-4 p-5"
      onSubmit={(event) => {
        // Which of the two verbs was pressed. Read off the submitter rather
        // than tracked in state, so the button that was actually clicked is the
        // one reported — the same fact the action reads out of the form data.
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        pending.current = { out: submitter?.getAttribute('value') === 'out', quantity };
        setDone(null);
      }}
    >
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div>
        <p className="field-label">{t('moveHowMany')}</p>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="btn btn-secondary h-14 w-14 shrink-0 p-0"
            aria-label={tc('cancel')}
            disabled={quantity <= 1}
            onClick={() => setQuantity((n) => Math.max(1, n - 1))}
          >
            <Minus size={24} aria-hidden />
          </button>

          {/* Typing is the escape hatch for "we just took delivery of forty",
              not the expected path — hence the size, and the numeric keypad. */}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            aria-label={t('moveHowMany')}
            onChange={(event) =>
              setQuantity(Math.max(1, Math.min(10_000, Math.floor(Number(event.target.value) || 1))))
            }
            className="field-input h-16 w-28 text-center text-[2rem] font-bold tabular-nums"
          />

          <button
            type="button"
            className="btn btn-secondary h-14 w-14 shrink-0 p-0"
            aria-label={tc('add')}
            onClick={() => setQuantity((n) => Math.min(10_000, n + 1))}
          >
            <Plus size={24} aria-hidden />
          </button>
        </div>

        <p className="mt-1.5 text-center text-[0.95rem] font-semibold text-ink-soft">
          {t('boxes', { count: quantity })}
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK.map((amount) => (
            <button
              key={amount}
              type="button"
              aria-pressed={quantity === amount}
              onClick={() => setQuantity(amount)}
              className={
                quantity === amount
                  ? 'btn btn-primary btn-sm min-w-12 tabular-nums'
                  : 'btn btn-secondary btn-sm min-w-12 tabular-nums'
              }
            >
              {amount}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
        >
          {state.message}
        </p>
      ) : null}

      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-ok/40 bg-ok-soft px-3 py-2 font-semibold text-ok"
        >
          <Check size={19} aria-hidden />
          {done.out
            ? t('moveTookOut', { count: done.quantity })
            : t('movePutBack', { count: done.quantity })}
        </p>
      ) : null}

      {/* The verb is the button. Green adds, brand takes out — the same two
          colours, in the same order, as the scanning console's direction pair,
          so the gesture reads the same on both screens. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton
          name="direction"
          value="in"
          className="h-16 flex-col gap-0.5 text-[1.05rem]"
          label={t('movePutBackAction', { count: quantity })}
          pendingLabel={tc('saving')}
          icon={<PackagePlus size={22} aria-hidden />}
        />
        <SubmitButton
          name="direction"
          value="out"
          variant="secondary"
          className="h-16 flex-col gap-0.5 text-[1.05rem]"
          label={t('moveTakeOutAction', { count: quantity })}
          pendingLabel={tc('saving')}
          // Refused server-side too; this is only so the button does not invite
          // a press that cannot succeed.
          disabled={short}
          icon={<PackageMinus size={22} aria-hidden />}
        />
      </div>

      {short ? (
        <p className="text-center text-[0.95rem] text-warn">
          {t('moveShort', { have: onHand })}
        </p>
      ) : null}
    </form>
  );
}
