import { Flame } from 'lucide-react';

/**
 * "This one first" — the single flag three different forms all needed.
 *
 * It used to be a bare checkbox with two spans after it, floating between two
 * proper fields with nothing around it, and it read as an afterthought rather
 * than as the decision it is. Here it gets a box of its own, and the box
 * *answers*: unticked it is quiet and grey like any other control, ticked it
 * turns the same red the board's badge uses, so the state is legible from across
 * the room without reading a word.
 *
 * The colour swap is `has-[:checked]` rather than React state on purpose. The
 * control is uncontrolled everywhere it is used — `FormDialog` puts typed values
 * back after a refusal by writing to the DOM, and a controlled checkbox would
 * quietly ignore that — so the styling has to follow the DOM, not a hook.
 */
export function UrgentToggle({
  name,
  value,
  defaultChecked = false,
  disabled = false,
  label,
  hint,
}: {
  name: string;
  /**
   * What a ticked box posts. Follow-ups send the priority enum's own name so an
   * unticked box sends nothing at all; a work case posts the browser default.
   */
  value?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  label: string;
  /** The half-sentence after the dash — what ticking it actually does. */
  hint: string;
}) {
  return (
    <label
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-line-strong
        bg-surface-soft px-3.5 py-3 font-semibold text-ink transition-colors
        hover:border-ink-faint has-[:checked]:border-danger has-[:checked]:bg-danger-soft
        has-[:checked]:text-danger has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="size-5 shrink-0 accent-[var(--color-danger)]"
      />
      <Flame
        size={18}
        aria-hidden
        className="shrink-0 text-ink-faint transition-colors group-has-[:checked]:text-danger"
      />
      {label}
      <span className="font-normal text-ink-soft group-has-[:checked]:text-danger">
        — {hint}
      </span>
    </label>
  );
}
