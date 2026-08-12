'use client';

import { surfaceAt, WHEEL_POSITIONS, type ToothSurface, type WheelPosition } from '@/lib/teeth';
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
 */

const CENTRE = 18;
const INNER = 6.2;
const OUTER = 14;
const RING = 15.4;

/** Tailwind red-500 — a marked surface, where the caller has no stronger opinion. */
export const SURFACE_MARKED = '#EF4444';
/** Tailwind slate-300 — an unmarked one. */
export const SURFACE_UNMARKED = '#CBD5E1';

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
  onSurfaceClick,
  readOnly = false,
  ring = true,
  className,
}: {
  toothNum: number;
  /** The colour for one surface. Called five times, once per face. */
  fillOf: (surface: ToothSurface) => string;
  onSurfaceClick?: (surface: ToothSurface) => void;
  readOnly?: boolean;
  /** The outer grey circle. Off where the target sits inside another outline. */
  ring?: boolean;
  className?: string;
}) {
  const interactive = !readOnly && onSurfaceClick !== undefined;
  const press = (surface: ToothSurface) =>
    interactive ? () => onSurfaceClick(surface) : undefined;

  const segment = cn('transition-[fill,opacity]', interactive && 'hover:opacity-80');

  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden
      className={cn(
        'h-full w-full transition-transform',
        interactive && 'cursor-pointer hover:scale-105',
        className,
      )}
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
            className={segment}
          />
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
        className={segment}
      />
    </svg>
  );
}
