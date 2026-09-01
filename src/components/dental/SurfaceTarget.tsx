import {
  surfaceAt,
  SURFACE_UNMARKED,
  WHEEL_POSITIONS,
  type ToothSurface,
  type WheelPosition,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * The five faces of one tooth, as the target every odontogram uses: a centre for
 * the biting surface and four segments around it for the sides.
 *
 * Which segment means which surface is not fixed — it depends on the arch and on
 * which side of the mouth the tooth is, because buccal points away from the
 * occlusal plane and mesial points at the midline. `surfaceAt` holds that
 * reasoning; this component only draws what it is told.
 *
 * Colour is the caller's business too. The patient chart paints a marked surface
 * in its tooth's status hue, the lab chart in its selection orange — passing a
 * `fillOf` rather than baking one palette in is what lets both use the same
 * geometry instead of keeping two copies of it.
 *
 * The target is a pointing shortcut, not the accessible control: it is hidden
 * from assistive technology, and both charts offer the same five surfaces as
 * real checkboxes for whichever tooth is open.
 *
 * Five separate targets, and it has to *look* like five. The clicks were always
 * per-segment — each wedge and the centre carry their own handler — but the
 * whole svg grew on hover and each wedge only dropped to 80% opacity, which on
 * an unmarked slate wedge is a change of about two values. So the entire wheel
 * reacted as one object and nothing said which of the five faces the pointer
 * was actually on: it read, and therefore behaved, like a single button that
 * happened to be drawn in pieces. Now nothing moves, and the wedge under the
 * pointer is the only thing that changes — darkened, and lifted away from its
 * neighbours by a heavier white margin.
 *
 * Darkened with a filter rather than a fill, because the fill belongs to the
 * caller: `fillOf` is slate for an unmarked face here, red for a marked one,
 * orange in the lab chart. `brightness` is the one hover that works over all of
 * them without this component having to know which palette it is wearing.
 *
 * Not marked `'use client'`, and that is load-bearing rather than an oversight.
 * The chart imports it into a client component, where it is bundled as usual;
 * the printed record sheet is a server component and renders the same wheel with
 * no handlers at all. There are no hooks here, so one file serves both — and the
 * paper cannot draw a different target from the screen.
 */

const CENTRE = 18;
const INNER = 6.2;
const OUTER = 14;
const RING = 15.4;

/** Degrees clockwise from three o'clock, which is how SVG's y-down axis reads. */
const SPAN: Record<WheelPosition, [number, number]> = {
  top: [225, 315],
  right: [315, 405],
  bottom: [45, 135],
  left: [135, 225],
};

function point(radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  return `${(CENTRE + radius * Math.cos(radians)).toFixed(2)} ${(
    CENTRE +
    radius * Math.sin(radians)
  ).toFixed(2)}`;
}

/** An annular sector — the doughnut slice between the two radii. */
function sector([from, to]: [number, number]): string {
  return [
    `M ${point(OUTER, from)}`,
    `A ${OUTER} ${OUTER} 0 0 1 ${point(OUTER, to)}`,
    `L ${point(INNER, to)}`,
    `A ${INNER} ${INNER} 0 0 0 ${point(INNER, from)}`,
    'Z',
  ].join(' ');
}

export function SurfaceTarget({
  toothNum,
  fillOf,
  labelOf,
  onSurfaceClick,
  onSurfacePointerDown,
  readOnly = false,
  ring = true,
  className,
}: {
  toothNum: number;
  /** The colour for one surface. Called five times, once per face. */
  fillOf: (surface: ToothSurface) => string;
  /**
   * What to call one surface, for the tooltip on the wedge.
   *
   * Which wedge is which depends on the arch and the side of the mouth, so the
   * one thing a pointing shortcut cannot do is let you learn the layout — and
   * clicking the wrong face of the right tooth is a quiet mistake. Naming it on
   * hover is what makes five targets legible as five. Optional: the target is
   * `aria-hidden` and the checkboxes remain the accessible control, so a caller
   * with no translations to hand simply gets no tooltip.
   */
  labelOf?: (surface: ToothSurface) => string;
  onSurfaceClick?: (surface: ToothSurface) => void;
  /**
   * The press that *begins* something rather than the click that completes it.
   *
   * The chart paints a run of teeth by dragging, and a drag has no click at the
   * end of it — a press on one target and a release over another produces
   * neither element's click. Optional, and separate from `onSurfaceClick`
   * rather than replacing it: the lab chart's wheel is a checkbox and has no
   * stroke to start.
   */
  onSurfacePointerDown?: (surface: ToothSurface) => void;
  readOnly?: boolean;
  /** The outer grey circle. Off where the target sits inside another outline. */
  ring?: boolean;
  className?: string;
}) {
  const interactive = !readOnly && onSurfaceClick !== undefined;
  const press = (surface: ToothSurface) =>
    interactive ? () => onSurfaceClick(surface) : undefined;
  const down = (surface: ToothSurface) =>
    !readOnly && onSurfacePointerDown ? () => onSurfacePointerDown(surface) : undefined;

  const segment = cn(
    'transition-[fill,filter,stroke-width] duration-100',
    interactive && 'cursor-pointer hover:brightness-90 hover:[stroke-width:2.2]',
  );

  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden
      className={cn('h-full w-full', className)}
    >
      {ring ? (
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RING}
          fill="none"
          stroke={SURFACE_UNMARKED}
          strokeWidth="1.1"
        />
      ) : null}

      {WHEEL_POSITIONS.map((position) => {
        const surface = surfaceAt(toothNum, position);
        return (
          <path
            key={position}
            d={sector(SPAN[position])}
            fill={fillOf(surface)}
            stroke="#ffffff"
            strokeWidth="1.3"
            onClick={press(surface)}
            onPointerDown={down(surface)}
            className={segment}
          >
            {labelOf ? <title>{labelOf(surface)}</title> : null}
          </path>
        );
      })}

      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={INNER}
        fill={fillOf('O')}
        stroke="#ffffff"
        strokeWidth="1.3"
        onClick={press('O')}
        onPointerDown={down('O')}
        className={segment}
      >
        {labelOf ? <title>{labelOf('O')}</title> : null}
      </circle>
    </svg>
  );
}
