import {
  ALL_TEETH,
  dentitionOf,
  isRightSide,
  isUpperArch,
  toothKind,
  type ToothKind,
  type ToothStatus,
  type ToothSurface,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * A tooth rendered rather than drawn — and rendered *in the state it is in*.
 *
 * The chart is the one screen where the picture **is** the interface: a dentist
 * reads "which tooth, which face of it, and what is wrong with it" off the
 * shape, and a grid of numbered squares makes them count along the row to find
 * out. So each tooth is modelled as itself and then the finding is drawn *as the
 * thing it is*, not as a coloured dot on top of it:
 *
 *   caries      a dark cavity eaten into the enamel, on the faces recorded
 *   filled      a restoration, set into the tooth and lit like a solid
 *   crown       a gold cap over the whole crown, with a margin at the neck
 *   root canal  the canals filled down each root, and the access cavity sealed
 *   implant     a titanium fixture where the roots were, carrying a crown
 *   extracted   the tooth ghosted, struck through
 *   missing     the outline only — the tooth that never came
 *
 * Three things make it read as a photograph of a tooth rather than a clipart one.
 *
 *  - **Every tooth is drawn at its own size and its own shape.** Not four
 *    silhouettes stretched across thirty-two positions: each of the eight kinds
 *    is modelled separately in each arch, from the millimetre measurements in
 *    `anatomyOf`. A lower central incisor really is 5mm across where an upper
 *    first molar is 11; a canine's root really is the longest in the mouth; the
 *    mesial root of a lower first molar really does bend distally. A row of
 *    same-sized lozenges is the single loudest tell that a chart was drawn
 *    rather than observed, and this fixes it before any shading lands.
 *  - **Teeth are not symmetrical, and the two sides of the mouth are mirrors.**
 *    An incisor's mesioincisal corner is sharp and its distoincisal one is
 *    rounded; a canine's cusp tip sits mesial of centre; roots lean distally.
 *    Every tooth here is built once with mesial to the right and *mirrored* for
 *    the other side of the mouth — which is what 16 and 26 are to each other.
 *  - **Every tooth is lit from one place** — above and to the left. Enamel is
 *    glassy, so what sells it is the value range: a warm dentin core glowing
 *    through, the silhouette thickened into a form shadow so each edge turns
 *    away, growth lines banding the cervical half, and a hard little specular.
 *    Flat fills with an outline look like a diagram no matter how correct.
 *
 * **Nothing painted into a tooth may be left-right directional** — every
 * gradient below is either vertical or symmetrical about the tooth's axis, and
 * all the sidedness comes from `lt-relief`. Paint a highlight on one side here
 * and half the mouth is lit from the wrong window.
 *
 * The lamp is fixed to the *cell*, not to the tooth. `lt-relief` wraps the flip
 * and the mirror rather than sitting inside them, so it lights whatever ends up
 * in the top-left of the box — which means every tooth on the page is lit from
 * one direction, the way a photograph of a mounted arch would be, and not that
 * the crown is always the lit end. On the upper arch the roots are what is up
 * there, so they are what catches the light. That is the intended trade: page
 * lighting that agrees with itself, at the cost of an upper root being glossier
 * than the enamel below it. If that ever needs to change, the fix is to make
 * the *specular* material-aware rather than to move the lamp per quadrant —
 * four lamps for four quadrants is four ways for them to disagree.
 *
 * The 26 silhouettes are each built once into `ToothDefs` and every tooth on the
 * page is a `<use>` of one. That is what pays for shading this deep: the layers
 * are authored once, and the whole page costs 26 drawings plus 32 references.
 */

/**
 * The band the drawing lives in: roots up at `y`, biting edge down at `y + h`,
 * the widest crown across `x`. Cropped close, because a tooth is a long thin
 * thing and the padding a square viewBox adds is padding the cell cannot spare.
 */
const VIEW = { x: 6, y: 24, w: 88, h: 222 };

/** Millimetres to view units. Everything anatomical below is written in
 *  millimetres, so the relative sizes come out right without being tuned by
 *  eye — and a tooth that is genuinely small is drawn small. */
const MM = 7.6;

/** The occlusal plane. Every tooth's biting edge sits on it — teeth meet there —
 *  and they differ in how far their roots reach up from it, which is the right
 *  way round. */
const INCISAL = 240;

/** The tooth's long axis. */
const CENTRE = 50;

/**
 * The lower arch is the same drawing stood on its head — mirrored about the
 * centre of the band, so a flipped tooth lands exactly where an upright one
 * does. The shading goes with it, which is right: on both arches the crown stays
 * the lit end and the root the dull one, which is what the eye actually reads.
 */
const FLIP = `translate(0, ${VIEW.y * 2 + VIEW.h}) scale(1, -1)`;

/** Canonical is mesial-to-the-right, so a tooth from the patient's left is its
 *  mirror image — as it is in the mouth. */
const MIRROR = `translate(${CENTRE * 2}, 0) scale(-1, 1)`;

/* ------------------------------------------------------------------ *
 * Drawing anatomy from landmarks
 * ------------------------------------------------------------------ */

/**
 * A point on an outline: x, y, and how sharp the outline is *at* it — 0 turns it
 * into a corner, 1 rounds it off completely.
 *
 * Sharpness is the reason these are landmarks rather than a path string. The
 * mesioincisal angle of an incisor is nearly a right angle and its distoincisal
 * angle is a curve; a cusp tip is a point and a height of contour is a bulge.
 * Getting those four things right is most of the difference between a tooth and
 * a leaf, and hand-authored Béziers make each of them a separate negotiation.
 */
type Pt = [x: number, y: number, sharpness?: number];

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * A Catmull-Rom spline through the landmarks, emitted as cubic Béziers — the
 * curve is made to pass *through* every point rather than be pulled at by it,
 * which is what lets the anatomy be written as measurements.
 */
function spline(points: Pt[], closed = false): string {
  const n = points.length;
  const at = (i: number): Pt =>
    closed ? points[((i % n) + n) % n] : points[Math.min(Math.max(i, 0), n - 1)];

  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1, s1 = 1] = at(i);
    const [x2, y2, s2 = 1] = at(i + 1);
    const [x3, y3] = at(i + 2);

    d +=
      ` C${f(x1 + ((x2 - x0) / 6) * s1)} ${f(y1 + ((y2 - y0) / 6) * s1)}` +
      ` ${f(x2 - ((x3 - x1) / 6) * s2)} ${f(y2 - ((y3 - y1) / 6) * s2)}` +
      ` ${f(x2)} ${f(y2)}`;
  }
  return closed ? `${d}Z` : d;
}

/** One root. Everything in millimetres, offsets measured mesially from the
 *  tooth's axis — so a negative apex on a positive base is a root leaning
 *  distally, which is how most of them lean. */
type Root = {
  /** Where the root's own axis crosses the cervical line. */
  base: number;
  /** Where its apex sits. The difference from `base` is the curve. */
  apex: number;
  /** Cervix to apex. */
  length: number;
  /** Mesiodistal thickness at the cervical line, where a root is widest. */
  width: number;
  /** How much of that thickness is gone by the apex. */
  taper?: number;
  /** Where along the root the thinning happens. Below 1 it is front-loaded, so
   *  the root leaves the neck at full width and is slim within a few
   *  millimetres — which is what a root does and what makes it a leg rather
   *  than a wedge. Above 1 it holds its width and rounds off at the end, which
   *  is what an implant fixture does. */
  curve?: number;
  /** Painted first, so the buccal pair overlaps it — an upper molar's palatal
   *  root is behind the other two, not beside them. */
  behind?: boolean;
  /** How much wider than its own width the root swells where it leaves the
   *  neck, as a fraction. Roots are widest at the cervical line and on a
   *  multi-rooted tooth they are *confluent* there — together they fill the
   *  neck, because for the first few millimetres they are one body. Without
   *  this the legs of a molar leave the neck as separate sticks with daylight
   *  between them and the tooth reads as a cactus. Zero for an implant fixture,
   *  which is a machined screw and does no such thing. */
  flare?: number;
};

type Anatomy = {
  /** Mesiodistal width at the contact points — the widest the crown gets. */
  width: number;
  /** Mesiodistal width at the cervical line. Always the narrower. */
  neck: number;
  /** Cervical line to biting edge. */
  height: number;
  /** How far down the crown the distal and mesial contact points sit, as a
   *  fraction of crown height. They are not the same: an anterior contacts high
   *  on the mesial and lower on the distal, and that one asymmetry is most of
   *  what makes a drawn incisor read as a particular tooth. */
  contour: [distal: number, mesial: number];
  /** How wide the biting edge is, as a fraction of the crown width. */
  edge: number;
  /** The biting edge itself, distal → mesial: x across the edge (−1…1), height
   *  above the deepest groove in millimetres, and how sharp that point is. */
  profile: Pt[];
  roots: Root[];
  /** Developmental grooves down the facial surface, as x across the edge. Cut
   *  into the enamel, so they are drawn dark. */
  grooves: number[];
  /** The lobes between them, standing proud, so they catch the light. */
  ridges: number[];
  /** Anteriors: the incisal band with no dentin behind it, which goes cool and
   *  slightly grey — the one thing that reads unmistakably as enamel. */
  translucent?: boolean;
};

/* The biting edges. Five shapes cover the mouth, and each of them is the thing
 * a dentist actually names the tooth by at a glance. */

/** A chisel — three lobes with faint notches between them, a sharp
 *  mesioincisal corner and a rounded distoincisal one. */
const INCISOR_EDGE: Pt[] = [
  [-1, 0.62, 0.85],
  [-0.62, 0.05, 0.8],
  [-0.28, 0.3, 0.9],
  [0, 0.02, 0.8],
  [0.28, 0.3, 0.9],
  [0.62, 0.05, 0.8],
  [1, 0.1, 0.18],
];

/** A single point. Its tip sits mesial of centre because the mesial cusp ridge
 *  is the shorter of the two — the detail that separates a canine from a fat
 *  incisor without needing the length. */
const CANINE_EDGE: Pt[] = [
  [-1, 2.7, 0.6],
  [-0.55, 1.15, 0.95],
  [0.12, 0, 0.28],
  [0.6, 1.25, 0.95],
  [1, 2.3, 0.4],
];

/**
 * One buccal cusp, tip a little distal of centre.
 *
 * The cusp ridges run almost straight from the proximal corners to the tip. Let
 * them bow outwards instead and the crown stops being a premolar and becomes a
 * light bulb — a dome with a nipple on it — which is what a cusp drawn as a
 * spike sitting on a bulge always looks like.
 */
const PREMOLAR_EDGE: Pt[] = [
  [-1, 2.9, 0.5],
  [-0.5, 1.35, 0.9],
  [-0.06, 0, 0.3],
  [0.54, 1.45, 0.9],
  [1, 2.7, 0.45],
];

/** Two buccal cusps split by the buccal groove — the mesiobuccal the larger of
 *  the pair, which is why the groove does not sit on the midline. */
const MOLAR_EDGE: Pt[] = [
  [-1, 2.1, 0.5],
  [-0.6, 0.18, 0.8],
  [-0.06, 1.85, 0.9],
  [0.6, 0, 0.8],
  [1, 2, 0.5],
];

/** The lower first molar's third buccal cusp — the distal cusp that makes it
 *  the one tooth in the mouth nameable from its outline alone. */
const FIVE_CUSP_EDGE: Pt[] = [
  [-1, 2, 0.5],
  [-0.8, 0.55, 0.8],
  [-0.55, 1.7, 0.9],
  [-0.14, 0.12, 0.8],
  [0.26, 1.85, 0.9],
  [0.68, 0, 0.8],
  [1, 2, 0.5],
];

/** A third molar: the same two cusps, worn round and crowded together. */
const THIRD_MOLAR_EDGE: Pt[] = [
  [-1, 1.8, 0.7],
  [-0.55, 0.4, 0.9],
  [-0.04, 1.5, 0.95],
  [0.55, 0.2, 0.9],
  [1, 1.7, 0.7],
];

/**
 * The permanent dentition, in millimetres, from the standard tables.
 *
 * These are measurements rather than taste, which is the point: written this way
 * the chart gets the *relative* sizes right for free, and relative size is what
 * a row of teeth is mostly made of. A lower central incisor at 5.2mm beside an
 * 11mm lower first molar is a difference you cannot draw by eye and cannot miss
 * once it is there.
 *
 * One number in here is load-bearing beyond its size: **the roots together are
 * as wide at the cervical line as the neck is.** Crown and root are one
 * continuous surface at the enamel margin — the tooth does not step in there —
 * and a root drawn any narrower turns every tooth on the chart into a mushroom
 * cap on a stick, which no amount of shading over the join will hide.
 */
function anatomyOf(kind: ToothKind, upper: boolean): Anatomy {
  if (upper) {
    switch (kind) {
      case 'CENTRAL_INCISOR':
        return {
          width: 8.5, neck: 7, height: 10.5,
          contour: [0.55, 0.7], edge: 0.9, profile: INCISOR_EDGE,
          roots: [{ base: 0, apex: -0.7, length: 13, width: 7 }],
          grooves: [-0.33, 0.33], ridges: [-0.64, 0, 0.64], translucent: true,
        };
      case 'LATERAL_INCISOR':
        // Narrower, shorter, and its distoincisal angle rounds off more than any
        // other tooth's — beside a central it should look like a smaller,
        // softer copy, because that is exactly what it is.
        return {
          width: 6.6, neck: 5, height: 9,
          contour: [0.52, 0.68], edge: 0.86, profile: INCISOR_EDGE,
          roots: [{ base: 0, apex: -1.4, length: 13, width: 4.9 }],
          grooves: [-0.32, 0.32], ridges: [-0.62, 0, 0.62], translucent: true,
        };
      case 'CANINE':
        return {
          width: 7.6, neck: 5.5, height: 10,
          contour: [0.45, 0.6], edge: 0.8, profile: CANINE_EDGE,
          roots: [{ base: 0, apex: -0.6, length: 17, width: 5.5 }],
          grooves: [-0.5, 0.52], ridges: [0.06], translucent: true,
        };
      case 'FIRST_PREMOLAR':
        // The one premolar with two roots — and they divide *buccopalatally*,
        // which is the whole point of it. Drawn as a mesial and a distal root
        // it came out as a tuning fork, a shape no tooth in the mouth has. From
        // the cheek the palatal root sits directly behind the buccal one and
        // barely clears its outline, so what the chart should show is a single
        // broad trunk that splits late and shallowly, with a second root
        // showing *through* rather than beside.
        return {
          width: 7.2, neck: 5.3, height: 8.6,
          contour: [0.4, 0.46], edge: 0.86, profile: PREMOLAR_EDGE,
          roots: [
            { base: 0, apex: -0.5, length: 13.5, width: 3.7, behind: true },
            { base: 0.2, apex: 0.9, length: 14, width: 3.9 },
          ],
          grooves: [-0.46, 0.48], ridges: [-0.04],
        };
      case 'SECOND_PREMOLAR':
        return {
          width: 6.7, neck: 4.7, height: 8.4,
          contour: [0.4, 0.46], edge: 0.86, profile: PREMOLAR_EDGE,
          roots: [{ base: 0, apex: -0.5, length: 14, width: 4.6 }],
          grooves: [-0.46, 0.48], ridges: [-0.04],
        };
      case 'FIRST_MOLAR':
        return {
          width: 10.2, neck: 8, height: 7.6,
          contour: [0.38, 0.44], edge: 0.88, profile: MOLAR_EDGE,
          roots: [
            { base: 0, apex: -0.5, length: 13, width: 4.6, behind: true },
            { base: 2.1, apex: 4, length: 12.6, width: 3.8 },
            { base: -2.2, apex: -4.2, length: 11.6, width: 3.4 },
          ],
          grooves: [-0.06], ridges: [-0.58, 0.58],
        };
      case 'SECOND_MOLAR':
        return {
          width: 9.6, neck: 7.6, height: 7.2,
          contour: [0.38, 0.44], edge: 0.88, profile: MOLAR_EDGE,
          roots: [
            { base: 0, apex: -0.3, length: 12.4, width: 4.4, behind: true },
            { base: 2, apex: 3.2, length: 12, width: 3.6 },
            { base: -2.15, apex: -3.4, length: 11.2, width: 3.3 },
          ],
          grooves: [-0.04], ridges: [-0.56, 0.56],
        };
      case 'THIRD_MOLAR':
        // Small, blunt, and its roots usually fused into one cone. Drawn as two
        // that overlap almost completely, which is what fusion looks like.
        return {
          width: 8.6, neck: 7, height: 6.6,
          contour: [0.4, 0.44], edge: 0.9, profile: THIRD_MOLAR_EDGE,
          roots: [
            { base: 1.1, apex: -0.4, length: 10, width: 4.8 },
            { base: -1.2, apex: -2.8, length: 9.6, width: 4.6 },
          ],
          grooves: [-0.02], ridges: [-0.5, 0.5],
        };
    }
  }

  switch (kind) {
    case 'CENTRAL_INCISOR':
      // The smallest tooth in the mouth, and it should look it.
      return {
        width: 5.2, neck: 3.6, height: 9.2,
        contour: [0.55, 0.66], edge: 0.94, profile: INCISOR_EDGE,
        roots: [{ base: 0, apex: -0.3, length: 12.6, width: 3.5 }],
        grooves: [-0.3, 0.3], ridges: [-0.6, 0, 0.6], translucent: true,
      };
    case 'LATERAL_INCISOR':
      // The one place in the mouth where the lateral is the *larger* of the
      // pair, which is how a lower anterior segment is told apart from an upper.
      return {
        width: 5.8, neck: 4, height: 9.6,
        contour: [0.53, 0.66], edge: 0.92, profile: INCISOR_EDGE,
        roots: [{ base: 0, apex: -0.8, length: 13.4, width: 3.9 }],
        grooves: [-0.3, 0.3], ridges: [-0.6, 0, 0.6], translucent: true,
      };
    case 'CANINE':
      return {
        width: 7, neck: 5.5, height: 11,
        contour: [0.44, 0.6], edge: 0.8, profile: CANINE_EDGE,
        roots: [{ base: 0, apex: -0.6, length: 16, width: 5.5 }],
        grooves: [-0.5, 0.52], ridges: [0.06], translucent: true,
      };
    case 'FIRST_PREMOLAR':
      return {
        width: 7, neck: 5, height: 8.6,
        contour: [0.4, 0.46], edge: 0.86, profile: PREMOLAR_EDGE,
        roots: [{ base: 0, apex: -0.6, length: 14, width: 4.9 }],
        grooves: [-0.46, 0.48], ridges: [-0.04],
      };
    case 'SECOND_PREMOLAR':
      return {
        width: 7.1, neck: 5, height: 8,
        contour: [0.4, 0.46], edge: 0.86, profile: PREMOLAR_EDGE,
        roots: [{ base: 0, apex: -0.5, length: 14.4, width: 4.9 }],
        grooves: [-0.46, 0.48], ridges: [-0.04],
      };
    case 'FIRST_MOLAR':
      // Widest tooth in the mouth, five cusps, and a broad mesial root that
      // bends *distally* — the bend is worth the two numbers it costs.
      return {
        width: 11, neck: 9, height: 7.6,
        contour: [0.38, 0.44], edge: 0.9, profile: FIVE_CUSP_EDGE,
        roots: [
          { base: 2.4, apex: 1.5, length: 14, width: 4.8 },
          { base: -2.4, apex: -3.2, length: 13, width: 4.2 },
        ],
        grooves: [-0.53, 0.26], ridges: [-0.78, -0.14, 0.66],
      };
    case 'SECOND_MOLAR':
      return {
        width: 10.5, neck: 8.2, height: 7.2,
        contour: [0.38, 0.44], edge: 0.9, profile: MOLAR_EDGE,
        roots: [
          { base: 1.9, apex: 1.4, length: 13, width: 4.6 },
          { base: -2, apex: -2.9, length: 12.4, width: 4.2 },
        ],
        grooves: [-0.06], ridges: [-0.58, 0.58],
      };
    case 'THIRD_MOLAR':
      return {
        width: 10, neck: 7.8, height: 7,
        contour: [0.4, 0.44], edge: 0.9, profile: THIRD_MOLAR_EDGE,
        roots: [
          { base: 1.4, apex: -0.2, length: 10.4, width: 5 },
          { base: -1.5, apex: -2.6, length: 9.8, width: 4.6 },
        ],
        grooves: [-0.04], ridges: [-0.5, 0.5],
      };
  }
}

/**
 * A milk tooth, from its permanent counterpart.
 *
 * Not a scaled copy: a primary crown is short and squat — wider than it is tall,
 * where its permanent counterpart is the other way round — with a marked bulge
 * at the neck, and its roots are slender and flare wide, around the permanent
 * tooth sitting in the bone underneath it, which is the whole reason they do.
 * The molar profiles do **not** come straight through, which was a real error
 * rather than a simplification. Borrowed by position, the primary first molar
 * inherited the permanent first molar's edge — including the distal cusp that
 * makes 46 nameable from its outline alone — and the primary second molar
 * inherited the permanent first's two-cusp edge. That is backwards twice over:
 * the primary first molar resembles no permanent tooth and has no distal cusp,
 * while the primary *second* molar is the near-copy of the permanent first,
 * three buccal cusps and all. Swapped here rather than in the tables, because
 * this is the one place that knows it is looking at a milk tooth.
 *
 * The cusps are scaled too. The edge profiles carry depth in absolute
 * millimetres, so a crown squashed to 62% kept a 2.1mm cusp on a 4.5mm tooth —
 * nearly half the crown height, against 29% on its permanent counterpart, which
 * drew every milk molar as a spike. Primary cusps are shallower than permanent
 * ones, not twice as deep.
 *
 * The first molar takes an extra pinch. In the permanent dentition the first
 * molar is the larger of the pair and in the primary dentition it is the
 * smaller, so borrowing the profile straight through would put them in the
 * wrong order — and the order is exactly what a five-tooth quadrant is read by.
 */
function primaryFrom(base: Anatomy, kind: ToothKind): Anatomy {
  const narrow = kind === 'FIRST_MOLAR' ? 0.85 : 1;
  const height = base.height * 0.62;
  const profile =
    kind === 'FIRST_MOLAR'
      ? MOLAR_EDGE
      : kind === 'SECOND_MOLAR'
        ? FIVE_CUSP_EDGE
        : base.profile;
  return {
    ...base,
    width: base.width * 0.8 * narrow,
    neck: base.neck * 0.68 * narrow,
    height,
    // Depth is in millimetres, so it has to come down with the crown it is cut
    // into — and a little further, because a milk cusp is blunter than a
    // permanent one as well as smaller.
    profile: profile.map(([x, mm, sharp]) => [x, mm * 0.62 * 0.88, sharp] as Pt),
    // The contact points sit higher, which is what the cervical bulge does to
    // the outline.
    contour: [base.contour[0] * 0.88, base.contour[1] * 0.88],
    roots: base.roots.map((root) => ({
      ...root,
      length: root.length * 0.86,
      width: root.width * 0.78,
      // A milk molar is the one place roots really do splay — they have to
      // clear the permanent premolar sitting in the bone between them — but
      // the splay is in the *ratio*, not the reach. The trunk pulls in with the
      // narrower neck and the apices stay roughly where the permanent tooth's
      // are; push them out beyond that as well and the tooth is a cactus.
      base: root.base * 0.7,
      apex: root.apex,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * From anatomy to paths
 * ------------------------------------------------------------------ */

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function rootAxisAt(root: Root, cej: number, t: number): [number, number] {
  // Smoothstep, so both the divergence of a molar's roots and the distal lean
  // of a single one gather in the apical half.
  const bend = smoothstep(t);

  // And the trunk. `base` is where a root's axis *ends up* once the legs have
  // parted, not where it leaves the neck — every one of them leaves the neck on
  // the tooth's own axis, because for the first few millimetres there is only
  // one root there.
  //
  // This was the bug that made every molar on the chart a cactus. The bend
  // above gathers the divergence apically, but it was applied to a base offset
  // the root already sat at from t=0, so a lower first molar's two legs started
  // 4.8mm apart at the cervical line with daylight between them — which is not
  // a molar, it is grade-III furcation involvement drawn on every molar in the
  // mouth. Held together for the first `TRUNK_DEPTH` of the root, they come out
  // of one body and part where a real furcation is.
  // Partly, not wholly. Pulling the axes all the way onto the midline at the
  // cervical line ties the legs in a knot and they splay out of it like a
  // bundle of sticks — worse than the gap it was fixing. Half way in is enough:
  // it closes the millimetre of daylight between two root outlines without
  // moving the apices, which are where the anatomy actually lives.
  const spread = smoothstep(Math.min(1, Math.max(0, t / TRUNK_DEPTH)));
  const emerge = TRUNK_CONVERGE + (1 - TRUNK_CONVERGE) * spread;

  return [
    CENTRE + (root.base * emerge + (root.apex - root.base) * bend) * MM,
    cej - root.length * MM * t,
  ];
}

/**
 * Half the root's thickness at `t`.
 *
 * Measured off buccal-view outlines of the permanent dentition rather than
 * guessed: a root is a **stout** thing. It keeps most of its cervical width
 * through the coronal half — still around seven tenths at mid-length — and does
 * nearly all its narrowing in the apical third, then rounds into a point over
 * the last tenth. That back-loaded profile is the whole character of a root.
 *
 * A front-loaded taper is the obvious mistake and it is the wrong one twice
 * over: the root is too thin to belong to the crown above it, and on a molar
 * the roots are already separate at the neck, so the tooth loses its root trunk
 * and reads as a cactus rather than as a tooth.
 */
function rootHalfAt(root: Root, t: number): number {
  const clamped = Math.max(t, 0);
  // Confluent at the neck, separate below it. Ramps out over the same depth the
  // axes are gathered across, so the swell and the convergence close the gap
  // between two roots at the same rate and the join has no step in it.
  const flare = 1 + (root.flare ?? 0) * (1 - smoothstep(Math.min(1, clamped / TRUNK_DEPTH)));
  return (
    ((root.width * MM) / 2) *
    flare *
    (1 - (root.taper ?? 0.66) * clamped ** (root.curve ?? 1.35)) *
    (1 - 0.62 * clamped ** 8)
  );
}

/** Starts inside the crown so the join is hidden, and takes an extra reading
 *  just below the neck, where the front-loaded taper does most of its work. */
const ROOT_SAMPLES = [-0.14, 0.05, 0.2, 0.42, 0.64, 0.82, 0.93];

function rootPath(root: Root, cej: number): string {
  const points: Pt[] = [];
  for (const t of ROOT_SAMPLES) {
    const [x, y] = rootAxisAt(root, cej, t);
    points.push([x - rootHalfAt(root, t), y]);
  }
  // The apex, as a corner rather than a curve — a root ends in a point.
  points.push([...rootAxisAt(root, cej, 1), 0.45]);
  for (const t of [...ROOT_SAMPLES].reverse()) {
    const [x, y] = rootAxisAt(root, cej, t);
    points.push([x + rootHalfAt(root, t), y]);
  }
  return spline(points, true);
}

function rootAxisPath(root: Root, cej: number, from: number, to: number): string {
  return spline(
    [from, from + (to - from) / 3, from + ((to - from) * 2) / 3, to].map(
      (t) => rootAxisAt(root, cej, t) as Pt,
    ),
  );
}

type Geometry = {
  crown: string;
  /** The cervical line alone — the enamel margin, and the edge the crown casts
   *  its own shadow from onto the root. */
  cervical: string;
  /** Each root, with the thickness everything drawn on it is measured against —
   *  a molar's slender distobuccal root and an incisor's broad one cannot share
   *  a stroke width, and scaling both off the crown gives one of them the
   *  other's. `axis` is the line down its middle: the canal for endodontics,
   *  and the core light that turns a tapering shape into a cylinder. */
  roots: Array<{
    d: string;
    behind: boolean;
    width: number;
    /** How far up the band this root reaches — the tooth's own length. */
    apexY: number;
    axis: string;
    canal: string;
  }>;
  grooves: string[];
  ridges: string[];
  /** Growth lines banding the cervical half of the enamel. Invisible one at a
   *  time; together they are why real enamel is not a painted panel. */
  perikymata: string[];
  /** The height of contour, where the facial surface is most convex and a strip
   *  of light runs right across the tooth. */
  bulge: string;
  /** The translucent incisal band, and the warm scatter just behind it. */
  translucent: string | null;
  glow: string | null;
  /** Lobes, rounding up towards the light individually. */
  lobes: Array<[cx: number, cy: number, r: number]>;
  /** Where the roots divide, and the shadow that sits in the crotch. */
  furcations: Array<[cx: number, cy: number, r: number]>;
  /** The dentin body glowing through the enamel. */
  core: [cx: number, cy: number, rx: number, ry: number];
  /** The two contact areas, polished by the teeth either side of them. */
  contacts: Array<[cx: number, cy: number, r: number]>;
  cej: number;
  height: number;
  halfWidth: number;
  implant: { body: string; collar: string; threads: string[] };
};

/**
 * The step at the enamel margin.
 *
 * Enamel is a shell over the dentine, so the crown really does overhang the
 * root it stands on, by about a tenth. Both ways of getting this wrong are
 * visible from across the room: draw them exactly equal and the crown's swell
 * runs straight on into the root's taper, so the tooth is one long spindle with
 * no neck in it; take much more off than this and it is a mushroom cap on a
 * stick. The measurements above are the *crown's* cervical width, and the step
 * is taken off once, here.
 */
const ENAMEL_STEP = 0.9;

/**
 * How far up the shorter leg the root trunk reaches, as a fraction of it.
 *
 * This is the furcation, and it is a real landmark rather than a drawing
 * convenience: it is where a periodontist stops calling a pocket a pocket and
 * starts calling it furcation involvement. Around a third is right for the
 * molars this applies to. Much less and the legs part at the neck and the tooth
 * is a cactus again; much more and the roots stop being separable at chart
 * size, which loses the one feature that makes a molar look like a molar.
 */
const TRUNK_DEPTH = 0.3;

/** How far in towards the tooth's axis the roots are gathered where they leave
 *  the neck, as a fraction of the offset they end up at. */
const TRUNK_CONVERGE = 0.45;

function build(a: Anatomy): Geometry {
  const w = a.width * MM;
  const ch = a.height * MM;
  const cej = INCISAL - ch;
  const hw = w / 2;
  const hn = (a.neck * MM) / 2;
  const he = (a.edge * w) / 2;
  const [distal, mesial] = a.contour;
  // Only the multi-rooted teeth swell at the neck, and only they need to: a
  // single root already leaves the cervical line at the full width of it, so
  // flaring one puts a shoulder on the tooth wider than its own crown — which
  // is not an anatomical feature, it is a mistake with a bevel on it.
  const confluent = a.roots.filter((root) => !root.behind).length > 1;
  const roots = a.roots.map((root) => ({
    ...root,
    width: root.width * ENAMEL_STEP,
    flare: root.flare ?? (confluent ? (a.roots.length > 2 ? 0.46 : 0.34) : 0),
  }));

  const edge: Pt[] = a.profile.map(([x, mm, sharp]) => [
    CENTRE + x * he,
    INCISAL - mm * MM,
    sharp,
  ]);

  // Anticlockwise from the cervical midpoint: down the distal outline, across
  // the biting edge, up the mesial outline, and back along the enamel margin —
  // which arches towards the root rather than running flat across.
  //
  // The two cervical landmarks are nearly corners. Round them off and the
  // crown's swell runs straight into the root's taper, and the tooth becomes
  // one long spindle with no neck in it; the small kink where the crown's
  // convex outline meets the root's concave one is what the eye reads as the
  // gum line — and it is a real edge, where enamel stops.
  const crown = spline(
    [
      [CENTRE, cej - ch * 0.05],
      [CENTRE - hn, cej, 0.35],
      [CENTRE - hw, cej + ch * distal, 0.8],
      ...edge,
      [CENTRE + hw, cej + ch * mesial, 0.8],
      [CENTRE + hn, cej, 0.35],
    ],
    true,
  );

  const cervical = spline([
    [CENTRE - hn, cej, 0.35],
    [CENTRE, cej - ch * 0.05],
    [CENTRE + hn, cej, 0.35],
  ]);

  // Where the roots divide. A real furcation starts a little below the neck and
  // is the darkest place on the tooth — nothing reaches into it.
  const front = roots.filter((root) => !root.behind);
  const furcations: Array<[number, number, number]> = [];
  for (let i = 0; i + 1 < front.length; i++) {
    const gap = Math.abs(front[i].base - front[i + 1].base) * MM;
    furcations.push([
      CENTRE + ((front[i].base + front[i + 1].base) / 2) * MM,
      // Sat at the neck before, which is a third of a root too low now that the
      // trunk is drawn: the shadow has to pool where the legs actually divide,
      // or it reads as a smudge on the trunk rather than as depth behind it.
      cej - Math.min(front[i].length, front[i + 1].length) * MM * TRUNK_DEPTH,
      Math.max(gap * 0.42, 5),
    ]);
  }

  // Denser towards the neck and gone by the middle third, the way they wear.
  const perikymata = [0.13, 0.22, 0.31, 0.41, 0.52].map((t) => {
    const y = cej + ch * t;
    const half = hn + (hw - hn) * Math.min(1, t / distal);
    return spline([
      [CENTRE - half * 1.06, y - ch * 0.015],
      [CENTRE, y + ch * 0.03],
      [CENTRE + half * 1.06, y - ch * 0.015],
    ]);
  });

  const bulge = spline([
    [CENTRE - hw * 1.02, cej + ch * (distal - 0.06)],
    [CENTRE, cej + ch * 0.46],
    [CENTRE + hw * 1.02, cej + ch * (mesial - 0.06)],
  ]);

  const lobeRadius = Math.min(hw * 0.5, (hw * 0.95) / Math.max(a.ridges.length, 1));

  return {
    crown,
    cervical,
    roots: roots.map((root) => ({
      d: rootPath(root, cej),
      behind: root.behind === true,
      width: root.width * MM,
      apexY: rootAxisAt(root, cej, 1)[1],
      axis: rootAxisPath(root, cej, 0.02, 0.86),
      // Canals start in the pulp chamber, inside the crown, and stop short of
      // the apex — obturation does, so a canal drawn to the tip is a filled
      // tooth charted as an overfilled one.
      canal: rootAxisPath(root, cej, -0.08, 0.9),
    })),
    grooves: a.grooves.map((x) =>
      spline([
        [CENTRE + x * he, INCISAL - ch * 0.05],
        [CENTRE + x * he * 0.94, cej + ch * 0.58],
        [CENTRE + x * he * 0.84, cej + ch * 0.34],
      ]),
    ),
    ridges: a.ridges.map((x) =>
      spline([
        [CENTRE + x * he, INCISAL - ch * 0.1],
        [CENTRE + x * he * 0.96, cej + ch * 0.52],
        [CENTRE + x * he * 0.88, cej + ch * 0.24],
      ]),
    ),
    perikymata,
    bulge,
    translucent: a.translucent
      ? spline(edge.map(([x, y]) => [CENTRE + (x - CENTRE) * 0.97, y - ch * 0.12]))
      : null,
    glow: a.translucent
      ? spline(edge.map(([x, y]) => [CENTRE + (x - CENTRE) * 0.94, y - ch * 0.27]))
      : null,
    lobes: a.ridges.map((x) => [CENTRE + x * he, cej + ch * 0.62, lobeRadius]),
    furcations,
    core: [
      CENTRE,
      cej + ch * (a.translucent ? 0.44 : 0.5),
      hw * 0.68,
      ch * (a.translucent ? 0.36 : 0.42),
    ],
    contacts: [
      [CENTRE - hw * 0.86, cej + ch * distal, hw * 0.2],
      [CENTRE + hw * 0.86, cej + ch * mesial, hw * 0.2],
    ],
    cej,
    height: ch,
    halfWidth: hw,
    implant: implantOf(a, cej, hn),
  };
}

/**
 * The fixture that replaces the tooth, sized to the tooth it replaces — a molar
 * implant is a wider, shorter screw than an incisor's, which is true and which
 * keeps the drawing in proportion with its neighbours.
 */
function implantOf(a: Anatomy, cej: number, hn: number): Geometry['implant'] {
  const collarHeight = 1.4 * MM;
  const collarY = cej - collarHeight;
  const fixture: Root = {
    base: 0,
    apex: 0,
    length: Math.min(13, Math.max(...a.roots.map((root) => root.length)) * 0.78),
    width: Math.min(5.4, Math.max(3.4, a.neck * 0.6)),
    // A screw holds its full width to the very end and then rounds off, where
    // even a stout root has thinned by half before it gets there.
    taper: 0.24,
    curve: 2.4,
    flare: 0,
  };

  const half = (t: number) => rootHalfAt(fixture, t);
  const length = fixture.length * MM;

  // V-threads cut as chevrons rather than flat rungs — flat ones read as a
  // ladder, which is not what a screw looks like.
  const threads: string[] = [];
  const pitch = 1.25 * MM;
  for (let depth = pitch * 0.6; depth < length - pitch * 0.5; depth += pitch) {
    const t = depth / length;
    const y = collarY - depth;
    const x = half(t) * 0.94;
    threads.push(
      `M${f(CENTRE - x)} ${f(y)} L${f(CENTRE)} ${f(y + pitch * 0.4)} L${f(CENTRE + x)} ${f(y)}`,
    );
  }

  return {
    body: rootPath(fixture, collarY),
    collar: spline(
      [
        [CENTRE - hn * 0.62, cej + 0.6 * MM, 0.2],
        [CENTRE - half(0) * 1.05, collarY, 0.2],
        [CENTRE + half(0) * 1.05, collarY, 0.2],
        [CENTRE + hn * 0.62, cej + 0.6 * MM, 0.2],
      ],
      true,
    ),
    threads,
  };
}

/* ------------------------------------------------------------------ *
 * Which drawing a tooth number gets
 * ------------------------------------------------------------------ */

type Variant = { key: string; anatomy: Anatomy };

function variantKeyOf(toothNum: number): string {
  const kind = toothKind(toothNum) ?? 'FIRST_MOLAR';
  const arch = isUpperArch(toothNum) ? 'u' : 'l';
  const dentition = dentitionOf(toothNum) === 'PRIMARY' ? 'p' : 'x';
  return `${kind.toLowerCase().replace(/_/g, '-')}-${arch}${dentition}`;
}

function anatomyFor(toothNum: number): Anatomy {
  const kind = toothKind(toothNum) ?? 'FIRST_MOLAR';
  const upper = isUpperArch(toothNum);
  const base = anatomyOf(kind, upper);
  return dentitionOf(toothNum) === 'PRIMARY' ? primaryFrom(base, kind) : base;
}

/**
 * Every drawing the chart can ask for, and only those — derived from the teeth
 * that exist rather than from a hand-kept list, so the defs and the chart cannot
 * drift apart.
 */
const VARIANTS: Variant[] = (() => {
  const seen = new Map<string, Variant>();
  for (const toothNum of ALL_TEETH) {
    const key = variantKeyOf(toothNum);
    if (!seen.has(key)) seen.set(key, { key, anatomy: anatomyFor(toothNum) });
  }
  return [...seen.values()];
})();

/** Built once per variant and shared: the paths are pure functions of the
 *  measurements, and there are thirty-two teeth pointing at twenty-six of them. */
const GEOMETRY = new Map<string, Geometry>(
  VARIANTS.map((variant) => [variant.key, build(variant.anatomy)]),
);

function geometryOf(toothNum: number): Geometry {
  return GEOMETRY.get(variantKeyOf(toothNum)) ?? [...GEOMETRY.values()][0];
}

/** The band every tooth has to fit inside. A drawing that leaves it is not
 *  clipped — it is drawn over the teeth either side of it. */
export const TOOTH_VIEW = VIEW;

/**
 * Every filled outline a tooth is drawn from, in that band.
 *
 * Exported for the test that keeps them inside it. The measurements above are
 * the kind of table that gets adjusted by hand later, and a number nudged too
 * far there fails silently and off-canvas rather than loudly.
 */
export function toothOutlines(toothNum: number): string[] {
  const g = geometryOf(toothNum);
  return [g.crown, ...g.roots.map((root) => root.d), g.implant.body, g.implant.collar];
}

/** The crown's widest mesiodistal measurement and the tooth's total length, in
 *  view units — the two proportions the chart is actually read by. */
export function toothProportions(toothNum: number): { width: number; length: number } {
  const g = geometryOf(toothNum);
  return {
    width: g.halfWidth * 2,
    length: INCISAL - Math.min(...g.roots.map((root) => root.apexY)),
  };
}

/**
 * The faces a surface-borne finding covers when none was recorded.
 *
 * Not all five: the lingual mark sits up at the neck, and painting it as well
 * leaves the tooth solid-red from root to biting edge, which says "the whole
 * tooth is gone" rather than "somebody did not write down where".
 */
const DEFAULT_FACES: readonly ToothSurface[] = ['O', 'B', 'M', 'D'];

/**
 * Where on the crown each surface is marked. Only one face of a tooth can point
 * at the reader, so mesial and distal are shown at the edges and lingual up at
 * the neck — a convention, but a legible one, and the wheel underneath is what
 * makes the answer exact.
 *
 * Mesial is always to the right here, because that is the frame every tooth is
 * drawn in; the mirror on the other side of the mouth carries the marks with it.
 */
function markAt(
  surface: ToothSurface,
  { halfWidth, cej, height }: Geometry,
): { cx: number; cy: number; r: number } {
  switch (surface) {
    case 'O':
      return { cx: CENTRE, cy: cej + height * 0.82, r: halfWidth * 0.5 };
    case 'B':
      return { cx: CENTRE, cy: cej + height * 0.55, r: halfWidth * 0.56 };
    case 'L':
      return { cx: CENTRE, cy: cej + height * 0.24, r: halfWidth * 0.44 };
    case 'M':
      return { cx: CENTRE + halfWidth * 0.68, cy: cej + height * 0.56, r: halfWidth * 0.42 };
    case 'D':
      return { cx: CENTRE - halfWidth * 0.68, cy: cej + height * 0.56, r: halfWidth * 0.42 };
  }
}

export function ToothGlyph({
  toothNum,
  status = 'HEALTHY',
  surfaces = [],
  className,
}: {
  toothNum: number;
  /** What is recorded on this tooth. Decides how the whole glyph is drawn. */
  status?: ToothStatus;
  /** Surfaces to mark, for the statuses where a surface makes sense. */
  surfaces?: ToothSurface[];
  className?: string;
}) {
  const key = variantKeyOf(toothNum);
  const g = geometryOf(toothNum);

  // A restoration and a cavity are drawn as opposite materials, and a
  // root-treated tooth whose surfaces were also restored is both at once.
  const restorative = status === 'FILLED' || status === 'ROOT_CANAL';

  const patches: readonly ToothSurface[] =
    status === 'CARIES' || status === 'FILLED'
      ? // A finding with no surface recorded still has to be visible — it covers
        // the crown rather than leaving a flagged tooth looking untouched.
        surfaces.length > 0
        ? surfaces
        : DEFAULT_FACES
      : status === 'ROOT_CANAL'
        ? // Only what was actually written down: the filled canals already say
          // the tooth was treated, so nothing has to be invented on top.
          surfaces
        : [];

  // Upside down for the lower arch, mirrored for the patient's left. Both stay
  // *inside* the lamp, so a flipped or mirrored tooth is still lit from the same
  // corner of the screen — which is the one thing that would give the trick away.
  const frame =
    [isUpperArch(toothNum) ? '' : FLIP, isRightSide(toothNum) ? '' : MIRROR]
      .filter(Boolean)
      .join(' ') || undefined;

  // Everything made of a material — the tooth and whatever has been done to it.
  // It all goes under the one light, so a gold cap and an amalgam are lit by the
  // same lamp as the enamel around them rather than sitting on top as decals.
  const body = (
    <g transform={frame}>
      <use href={status === 'IMPLANT' ? `#lt-implant-${key}` : `#lt-form-${key}`} />

      {/* Endodontics: the canals obturated down each root, and the access
          cavity sealed on top. Drawn under the crown work, so a root-treated
          tooth that then took a crown reads as both. */}
      {status === 'ROOT_CANAL' ? (
        <g clipPath={`url(#lt-clip-${key})`}>
          {g.roots.map((root) => (
            <g key={root.canal}>
              <path
                d={root.canal}
                fill="none"
                stroke="#5B21B6"
                strokeWidth={Math.max(3, root.width * 0.19)}
                strokeLinecap="round"
                opacity="0.85"
              />
              <path
                d={root.canal}
                fill="none"
                stroke="#C4B5FD"
                strokeWidth={Math.max(1.2, root.width * 0.07)}
                strokeLinecap="round"
                opacity="0.75"
              />
            </g>
          ))}
          <circle
            cx={CENTRE}
            cy={g.cej + g.height * 0.74}
            r={g.halfWidth * 0.42}
            fill="url(#lt-endo-access)"
          />
        </g>
      ) : null}

      {/* A cap, not a colour: gold over the crown only, stopping at the neck
          where a real one does, with the darker line of the margin at its edge. */}
      {status === 'CROWN' ? (
        <g clipPath={`url(#lt-crown-clip-${key})`}>
          <path d={g.crown} fill="url(#lt-gold)" />
          {g.ridges.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#FEF3C7"
              strokeWidth={g.halfWidth * 0.28}
              strokeLinecap="round"
              opacity="0.3"
              filter="url(#lt-haze)"
            />
          ))}
          <path
            d={g.crown}
            fill="none"
            stroke="#78350F"
            strokeWidth={g.halfWidth * 0.16}
            opacity="0.4"
            filter="url(#lt-crisp)"
          />
          <path d={g.crown} fill="none" stroke="#92400E" strokeWidth="1.4" opacity="0.75" />
        </g>
      ) : null}

      {patches.map((surface) => {
        const { cx, cy, r } = markAt(surface, g);
        if (restorative) {
          return (
            <g key={surface} clipPath={`url(#lt-clip-${key})`}>
              {/* A restoration is a solid body set *into* the tooth: a dark
                  seam where it meets enamel, and a lit face inside it. */}
              <circle cx={cx} cy={cy} r={r} fill="url(#lt-amalgam)" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#0C4A6E"
                strokeWidth="1.6"
                opacity="0.75"
              />
            </g>
          );
        }

        // Caries: a hole, so it is darkest in the middle and fades into the
        // enamel around it rather than stopping at a rim.
        return (
          <g key={surface} clipPath={`url(#lt-clip-${key})`}>
            <circle cx={cx} cy={cy} r={r * 1.2} fill="url(#lt-caries-halo)" />
            <circle cx={cx} cy={cy} r={r * 0.74} fill="url(#lt-caries)" />
          </g>
        );
      })}
    </g>
  );

  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      className={cn('h-full w-full overflow-visible', className)}
      aria-hidden
    >
      {status === 'MISSING' ? (
        // Never erupted, or long gone: the shape of the gap, not a tooth. No
        // light on it either — there is no surface there to catch any.
        <g transform={frame}>
          <path
            d={g.crown}
            fill="#f1f5f9"
            fillOpacity="0.5"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeDasharray="7 6"
            strokeLinejoin="round"
          />
          {g.roots.map((root) => (
            <path
              key={root.d}
              d={root.d}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.6"
              strokeDasharray="5 7"
              opacity="0.6"
            />
          ))}
        </g>
      ) : (
        <g filter="url(#lt-relief)" opacity={status === 'EXTRACTED' ? 0.32 : undefined}>
          {body}
        </g>
      )}

      {/* Struck through, over everything, because the point of the mark is that
          there is nothing left to read underneath it — and flat, because it is
          notation rather than a thing in the mouth. */}
      {status === 'EXTRACTED' ? (
        <g
          transform={frame}
          stroke="#475569"
          strokeWidth={Math.max(7, g.halfWidth * 0.26)}
          strokeLinecap="round"
          opacity="0.9"
        >
          <path
            d={`M${f(CENTRE - g.halfWidth)} ${f(g.cej - g.height * 0.18)} L${f(
              CENTRE + g.halfWidth,
            )} ${f(g.cej + g.height * 0.95)}`}
          />
          <path
            d={`M${f(CENTRE + g.halfWidth)} ${f(g.cej - g.height * 0.18)} L${f(
              CENTRE - g.halfWidth,
            )} ${f(g.cej + g.height * 0.95)}`}
          />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * One fully modelled tooth, built once and pointed at by every instance.
 *
 * The order is the order a painter would work in: roots finished before the
 * crown lands on them, then the crown flooded with enamel and everything after
 * it painted broadly and blurred, cut back to the tooth's own outline. Shading
 * that follows the silhouette is what separates a rendered form from a shape
 * with a gradient on it.
 */
function ToothForm({ variant }: { variant: Variant }) {
  const g = GEOMETRY.get(variant.key)!;
  const { crown, cervical, height: ch, halfWidth: hw } = g;

  return (
    <g id={`lt-form-${variant.key}`}>
      {/* Roots and crown are laid down as *materials* only — cementum and
          enamel, flat but for their own gradients. Nothing here tries to make
          them look round; that is the light's job, one level up, and painting
          the form twice only muddies it. */}
      {/* Behind first — an upper molar's palatal root is *behind* the buccal
          pair, not beside them, and the trunk has to cover its join too. */}
      {g.roots
        .filter((root) => root.behind)
        .map((root) => (
          <g key={root.d}>
            <path d={root.d} fill="url(#lt-root-deep)" />
            <path d={root.d} fill="url(#lt-across-root)" />
          </g>
        ))}

      {g.roots
        .filter((root) => !root.behind)
        .map((root) => (
          <g key={root.d}>
            <path d={root.d} fill="url(#lt-root)" />
            {/* Its own barrel. Painted per root rather than over the group so a
                molar's three legs each round off separately — one gradient
                stretched across all three shades the *cluster* like a single
                fat cylinder, which is exactly the reading to avoid. */}
            <path d={root.d} fill="url(#lt-across-root)" />
          </g>
        ))}

      <g clipPath={`url(#lt-root-clip-${variant.key})`}>
        {/* Down the middle of each root, so a tapering outline reads as a
            cylinder rather than a flat wedge. Symmetrical about the axis on
            purpose: the sidedness comes from the lamp, not from here. */}
        <g filter="url(#lt-haze)">
          {g.roots.map((root) => (
            <path
              key={root.axis}
              d={root.axis}
              fill="none"
              stroke="#fdf6e6"
              strokeWidth={root.width * 0.2}
              strokeLinecap="round"
              opacity="0.34"
            />
          ))}
        </g>

        <g filter="url(#lt-soft)">
          {/* The darkest place on a tooth: the crotch where the roots divide,
              which nothing reaches into. */}
          {g.furcations.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#4a3512" opacity="0.5" />
          ))}
          {/* Each root's own edge turning away — an ambient shadow rolled in
              from the outline, which the lamp alone cannot give a shape that
              overlaps the one behind it. */}
          {g.roots.map((root) => (
            <path
              key={root.d}
              d={root.d}
              fill="none"
              stroke="#6b5222"
              strokeWidth={root.width * 0.18}
              opacity="0.42"
            />
          ))}
        </g>

        {/* The one shadow the height map cannot know about: crown and root are a
            single silhouette to it, so it has no way to see that the crown
            overhangs and casts down onto the neck. Without this they meet at a
            flat ledge and read as two pieces glued together. */}
        <g filter="url(#lt-soft)">
          <path d={cervical} fill="none" stroke="#4c3813" strokeWidth={ch * 0.3} opacity="0.42" />
        </g>
      </g>

      <path d={crown} fill="url(#lt-enamel)" />
      {/* And the crown's own barrel, over the enamel and under everything the
          light does to it. Softer than the root's: the facial surface of a
          crown really is flattened across the middle third, which is why a
          tooth catches a broad band of light where a root catches a stripe. */}
      <path d={crown} fill="url(#lt-across)" />

      <g clipPath={`url(#lt-crown-clip-${variant.key})`}>
        {/* Dentin, warmer and duller, glowing up through the enamel — the one
            thing that stops a white shape reading as plastic. A radial gradient
            rather than a blurred ellipse: same haze, no filter pass. */}
        <ellipse cx={g.core[0]} cy={g.core[1]} rx={g.core[2]} ry={g.core[3]} fill="url(#lt-dentin)" />

        <g filter="url(#lt-soft)">
          {/* The cervical third, sunk into the gum's shade. */}
          <path d={cervical} fill="none" stroke="#5e4718" strokeWidth={ch * 0.22} opacity="0.42" />

          {/* Enamel with no dentin behind it: the biting edge of a front tooth
              goes cool and slightly grey, with a warm band of scattered light
              just behind it where the dentin does still reach. Together they
              are the reason a real incisal edge looks lit from inside. */}
          {g.glow ? (
            <path
              d={g.glow}
              fill="none"
              stroke="#e8b978"
              strokeWidth={ch * 0.16}
              strokeLinecap="round"
              opacity="0.3"
            />
          ) : null}
          {g.translucent ? (
            <path
              d={g.translucent}
              fill="none"
              stroke="#a3b6c6"
              strokeWidth={ch * 0.2}
              strokeLinecap="round"
              opacity="0.38"
            />
          ) : null}

          {g.lobes.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#fffdf4" opacity="0.32" />
          ))}
        </g>

        <g filter="url(#lt-haze)">
          {/* The height of contour: a strip of light right across the tooth
              where the facial surface stops leaning away from the viewer. */}
          <path
            d={g.bulge}
            fill="none"
            stroke="#fffdf6"
            strokeWidth={ch * 0.13}
            strokeLinecap="round"
            opacity="0.34"
          />

          {/* The contact areas, polished flat by the teeth either side. */}
          {g.contacts.map(([cx, cy, r]) => (
            <circle key={cx} cx={cx} cy={cy} r={r} fill="#6b5836" opacity="0.26" />
          ))}

          {/* And the enamel margin itself, which is a real edge: enamel stops
              and cementum starts, and the join catches a line of shadow. */}
          <path d={cervical} fill="none" stroke="#8a6b2e" strokeWidth="2.4" opacity="0.32" />
        </g>

        {/* Everything below is meant to be felt rather than seen. These are
            surface markings a millimetre deep on a tooth the size of a
            fingernail, and at chart size the whole of it should read as
            *texture* — turn any of it up far enough to pick out and the crown
            goes corduroy. */}
        <g filter="url(#lt-haze)">
          {g.ridges.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#fffdf2"
              strokeWidth={hw * 0.3}
              strokeLinecap="round"
              opacity="0.1"
            />
          ))}

          {/* Growth lines. Each one is nothing; five of them are the difference
              between enamel and a painted panel. */}
          {g.perikymata.map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke="#8a6f38" strokeWidth="1" opacity="0.05" />
              <path
                d={d}
                fill="none"
                stroke="#fffef8"
                strokeWidth="1"
                opacity="0.08"
                transform="translate(0 -1.6)"
              />
            </g>
          ))}

          {g.grooves.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#7d5f27"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.16"
            />
          ))}
        </g>
      </g>

      {/* Barely there. Enamel transmits light at a thin edge, so a tooth has no
          drawn outline — this is only enough to keep the silhouette from
          dissolving into a white page. */}
      <path
        d={crown}
        fill="none"
        stroke="#8a7040"
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * A tooth replaced rather than repaired: a titanium fixture in the bone, an
 * abutment at the gum line, a ceramic crown on top.
 *
 * The screw is the whole point of the drawing. Nothing else in dentistry looks
 * like it, so an implant is identifiable on a chart at thumbnail size — which a
 * tooth tinted teal is not.
 */
function ImplantForm({ variant }: { variant: Variant }) {
  const g = GEOMETRY.get(variant.key)!;
  const { body, collar, threads } = g.implant;

  return (
    <g id={`lt-implant-${variant.key}`}>
      <path d={body} fill="url(#lt-titanium)" />
      <g clipPath={`url(#lt-implant-clip-${variant.key})`}>
        {threads.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#0F766E"
            strokeWidth="2.2"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
        ))}
      </g>
      <path d={body} fill="none" stroke="#115E59" strokeWidth="1.3" strokeOpacity="0.6" />

      {/* The abutment — the collar the crown is cemented onto. */}
      <path d={collar} fill="url(#lt-titanium)" />
      <path d={collar} fill="none" stroke="#115E59" strokeWidth="1.2" strokeOpacity="0.6" />

      {/* Ceramic crown: this tooth's own silhouette, cooler and glassier than
          enamel — an implant crown is whiter than what it replaces, and has
          none of the growth lines, because nothing grew it. */}
      <path d={g.crown} fill="url(#lt-ceramic)" />
      <g clipPath={`url(#lt-crown-clip-${variant.key})`}>
        <g filter="url(#lt-soft)">
          <path
            d={g.cervical}
            fill="none"
            stroke="#0F766E"
            strokeWidth={g.height * 0.3}
            opacity="0.16"
          />
        </g>
        <g filter="url(#lt-haze)">
          <path
            d={g.bulge}
            fill="none"
            stroke="#ffffff"
            strokeWidth={g.height * 0.14}
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      </g>
      <path
        d={g.crown}
        fill="none"
        stroke="#0F766E"
        strokeOpacity="0.5"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * The shared drawings and paint.
 *
 * Built once at module load and handed back by reference, so the twenty-six
 * fully modelled teeth in here are created exactly one time no matter how often
 * the chart around them re-renders — React skips a subtree whose element is the
 * same object it saw last, and hovering a findings row re-renders the chart.
 */
const DEFS = (
  <svg width="0" height="0" aria-hidden className="absolute">
    <defs>
      {/* Regions in user space, covering the whole tooth, rather than as a
          percentage of each element's own box. A percentage region is a trap
          here: the gum line is a wide, almost flat path, so its box is a few
          units tall and 150% of nothing still clips the blur — which shows up
          as a hard-edged rectangle straight across the neck.

          Sized off `VIEW` plus a margin of a few blur radii rather than the
          hand-picked `-30 -20 160x300` these carried, which was 2.5x the area
          of the band itself. Filters cost per pixel of region, four of them run
          per tooth, and the teeth just got four times the area — so the slack
          was about to be paid for thirty-two times over on every repaint.

          `sRGB` on all three, to match `lt-relief` below. The SVG default is
          linearRGB, and running the shading overlays in one space and the
          lighting in the other is the kind of disagreement that gets tuned
          around by eye and then never makes sense again. */}
      <filter
        id="lt-soft"
        filterUnits="userSpaceOnUse"
        x={VIEW.x - 12}
        y={VIEW.y - 12}
        width={VIEW.w + 24}
        height={VIEW.h + 24}
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter
        id="lt-haze"
        filterUnits="userSpaceOnUse"
        x={VIEW.x - 8}
        y={VIEW.y - 8}
        width={VIEW.w + 16}
        height={VIEW.h + 16}
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="2.6" />
      </filter>
      <filter
        id="lt-crisp"
        filterUnits="userSpaceOnUse"
        x={VIEW.x - 4}
        y={VIEW.y - 4}
        width={VIEW.w + 8}
        height={VIEW.h + 8}
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="1" />
      </filter>

      {/*
        The form itself, lit rather than painted.

        Blurring the silhouette's alpha turns it into a height map: flat across
        the belly, ramping down at every edge. Lighting that map gives a normal
        at every pixel, so the shading follows the outline exactly and for free
        — a molar's cusps, the constriction at the neck, each root rounding into
        its own cylinder even where it overlaps the one behind it. Hand-painted
        shadows can approximate that; they cannot match it, because a stroked
        outline knows the edge but not the slope.

        It is also what makes the mirror safe. The lamp lives out here, outside
        the flip and outside the mirror, so a tooth from the patient's left is
        drawn back to front and still lit from the same window.

        `sRGB` interpolation is deliberate. The default, linearRGB, is more
        physically correct and looks washed out at these values — the specular
        in particular loses its bite.

        Region cropped to the drawing rather than given the generous margin the
        blur filters get. Lighting is by far the most expensive thing on this
        page and it costs per pixel of filter region, so the margin is not free
        — and it buys nothing here, because the result is composited back `in`
        the silhouette and everything outside it is discarded anyway.
      */}
      <filter
        id="lt-relief"
        filterUnits="userSpaceOnUse"
        x={VIEW.x}
        y={VIEW.y - 2}
        width={VIEW.w}
        height={VIEW.h + 4}
        colorInterpolationFilters="sRGB"
      >
        {/* Tighter than the shading blurs: the height map has to resolve a cusp
            and the gap between two roots, and at a wider radius both dissolve
            into the same dome. */}
        {/*
          The height map, and where it comes from is the whole argument.

          It used to be `SourceAlpha` — the silhouette's own coverage, blurred.
          That is a mesa: flat right across the interior and sloping only in the
          few pixels at the rim, so the *only* thing the lamp could ever model
          was the outline. Every measurement above it — the cusp ridges, the
          lobes standing proud between the developmental grooves, the swell at
          the height of contour, the dip into a furcation — was painted into a
          surface the light had already decided was perfectly flat, and so none
          of it lit. That is why a tooth with this much anatomy in it still came
          out looking like a sticker.

          Taking luminance off the painted graphic instead makes the paint the
          relief: what was painted light stands up, what was painted dark sinks,
          and the lamp finally has something to catch. It costs nothing extra —
          the same one lighting pass, one cheap matrix in front of it — and it
          means the modelling and the shading can no longer disagree, because
          they are now the same data.

          Outside the silhouette the graphic is transparent black, so luminance
          is zero there and the rim ramp comes back for free after the blur.
        */}
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0.33 0.5 0.17 0 0"
          result="lt-height"
        />
        <feGaussianBlur in="lt-height" stdDeviation="3.4" result="lt-bump" />

        {/* The body turning away from the light. `diffuseConstant` is set to
            1/sin(elevation) so a surface facing straight at the viewer comes
            back at exactly white and multiplies to nothing — anything less and
            the whole tooth is dimmed rather than modelled.

            `surfaceScale` is the tuning that matters and it wants to be *low*.
            A height map made by blurring an alpha channel is flat across the
            middle and ramps at every edge, so the scale controls how steeply
            that rim turns away from the lamp — and at 6 it turned far enough
            to go frankly dark, which drew a grey halo round the silhouette of
            every tooth on the chart. Halved, with a wider blur under it, the
            edge now rolls instead of falling off a cliff. */}
        {/* `diffuseConstant` was set to 1/sin(elevation) = 1.2208, which is
            exactly the value that makes a surface facing the viewer come back
            at 1.0 and multiply to nothing. Against a mesa height map that was
            deliberate — it kept the flat interior from being dimmed. Against a
            height map that now has the anatomy in it, it is the one thing
            stopping any of that anatomy from showing, so it comes down: a
            little under unity is what lets a lit face read as lit. */}
        <feDiffuseLighting
          in="lt-bump"
          surfaceScale="2.4"
          diffuseConstant="1.17"
          lightingColor="#fffdf7"
          result="lt-diffuse"
        >
          <feDistantLight azimuth="228" elevation="55" />
        </feDiffuseLighting>
        <feComposite in="lt-diffuse" in2="SourceAlpha" operator="in" result="lt-diffuse-cut" />
        <feBlend in="SourceGraphic" in2="lt-diffuse-cut" mode="multiply" result="lt-shaded" />

        {/* And the gloss.
            The lamp is thrown well off to the side, and that placement is the
            whole trick. A height map from a blurred silhouette is flat across
            the middle and only slopes at the edges, so a light anywhere near
            the viewing axis returns the *same* near-maximum specular over the
            entire interior — the crown goes uniformly white and the shading
            underneath is lost. Off to the side, the flat middle falls to almost
            nothing and only the surfaces rolling over towards the lamp light
            up, which is where enamel actually shines. */}
        <feSpecularLighting
          in="lt-bump"
          surfaceScale="3.6"
          specularConstant="0.34"
          specularExponent="34"
          lightingColor="#fffdf8"
          result="lt-spec"
        >
          <fePointLight x="-30" y="70" z="110" />
        </feSpecularLighting>
        <feComposite in="lt-spec" in2="SourceAlpha" operator="in" result="lt-spec-cut" />
        <feComposite
          in="lt-shaded"
          in2="lt-spec-cut"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3="1"
          k4="0"
          result="lt-lit"
        />

        {/* And back inside the silhouette. `arithmetic` adds *premultiplied*
            RGBA, alpha included, so every antialiased pixel on the rim came out
            of that sum at about twice the coverage it went in with and clamped
            — a hard, faintly direction-dependent edge on a drawing whose whole
            argument is that enamel has no drawn outline. Costs one composite. */}
        <feComposite in="lt-lit" in2="SourceAlpha" operator="in" />
      </filter>

      {/*
        Every gradient below runs down the tooth or is symmetrical about its
        axis, never across it. Half the mouth is drawn mirrored, so a highlight
        painted on one side here would be lit from the wrong window on sixteen
        teeth — all the sidedness belongs to `lt-relief`, which sits outside the
        mirror.
      */}

      {/* Warm and dark at the neck where the gum shades it, brightest across
          the belly, cooling to grey at the biting edge where the enamel has no
          dentin behind it — the way a real crown grades from top to bottom. */}
      <linearGradient id="lt-enamel" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#e9dfc7" />
        <stop offset="10%" stopColor="#faf5ea" />
        <stop offset="34%" stopColor="#ffffff" />
        <stop offset="64%" stopColor="#fffefc" />
        <stop offset="86%" stopColor="#f7f6f1" />
        <stop offset="100%" stopColor="#dee4e6" />
      </linearGradient>

      {/* y=0 is the apex, y=1 where it meets the crown: dull at the tip,
          blending into enamel at the neck — but never *past* it. Taking the
          root lighter than the crown puts a bright strip across the neck,
          because the crown's cervical edge dips and leaves root showing.

          Kept a clear step warmer and darker than the enamel above it. Crown
          and root being near the same value is what made the old drawing read
          as one carved beige object: on a real tooth the cementum is the one
          frankly *tan* thing on the page, and that contrast is most of what
          tells the eye where the gum line would sit. */}
      <linearGradient id="lt-root" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#b3a684" />
        <stop offset="32%" stopColor="#c7bb9b" />
        <stop offset="68%" stopColor="#d8ceb2" />
        <stop offset="100%" stopColor="#e9e1cb" />
      </linearGradient>

      {/* The same cementum with the light off it: an upper molar's palatal root
          is behind the buccal pair, and depth here is a value difference. */}
      <linearGradient id="lt-root-deep" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#92886a" />
        <stop offset="32%" stopColor="#a39877" />
        <stop offset="68%" stopColor="#b4a988" />
        <stop offset="100%" stopColor="#c3b99a" />
      </linearGradient>

      {/*
        Across the tooth rather than down it — the one thing the drawing had no
        answer for, and the reason every tooth read as a flat panel with a
        gradient on it.

        A tooth is a barrel. The facial surface faces the reader only along the
        middle; towards each proximal edge it rolls away and goes into shade,
        and *that* is what the eye reads as roundness. Every gradient here used
        to run neck-to-edge only, so the form was shaded along its length and
        not at all across it — a cylinder lit like a plank.

        Symmetric about the axis, which is what makes it safe: half the mouth is
        drawn mirrored, and a highlight painted nearer one edge than the other
        would light sixteen teeth from the wrong window. A dark-light-dark ramp
        is its own mirror image, so it survives the flip. All the *sidedness*
        still belongs to `lt-relief`, which sits outside the mirror.
      */}
      {/* Cool, not brown. Enamel is a near-colourless glass over yellow
          dentine, so a crown's warmth belongs in the middle of it where the
          dentine shows through — shading the rim brown as well left the crown
          the same tan as the root beneath it, and lost the value step that is
          most of how a chart says where one ends and the other begins. */}
      <linearGradient id="lt-across" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stopColor="#4f5052" stopOpacity="0.44" />
        <stop offset="8%" stopColor="#65645f" stopOpacity="0.26" />
        <stop offset="20%" stopColor="#847f70" stopOpacity="0.11" />
        <stop offset="34%" stopColor="#ffffff" stopOpacity="0.04" />
        <stop offset="50%" stopColor="#ffffff" stopOpacity="0.2" />
        <stop offset="66%" stopColor="#ffffff" stopOpacity="0.04" />
        <stop offset="80%" stopColor="#847f70" stopOpacity="0.11" />
        <stop offset="92%" stopColor="#65645f" stopOpacity="0.26" />
        <stop offset="100%" stopColor="#4f5052" stopOpacity="0.44" />
      </linearGradient>

      {/* The same barrel, harder — a root is a much rounder thing than a crown
          and has no flattened facial surface to hold the light. Applied per
          root rather than to the group, so each leg of a molar gets its own
          cylinder instead of the three of them sharing one. */}
      <linearGradient id="lt-across-root" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stopColor="#4e4636" stopOpacity="0.46" />
        <stop offset="15%" stopColor="#6f6650" stopOpacity="0.2" />
        <stop offset="37%" stopColor="#fbf7ec" stopOpacity="0.1" />
        <stop offset="50%" stopColor="#fffdf6" stopOpacity="0.22" />
        <stop offset="63%" stopColor="#fbf7ec" stopOpacity="0.1" />
        <stop offset="85%" stopColor="#6f6650" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#4e4636" stopOpacity="0.46" />
      </linearGradient>

      {/* Gold, as metal: several bands rather than two stops, because what makes
          a surface read as metal is the sharp light-to-dark turn. */}
      <linearGradient id="lt-gold" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#B45309" />
        <stop offset="16%" stopColor="#FDE68A" />
        <stop offset="38%" stopColor="#F59E0B" />
        <stop offset="58%" stopColor="#FCD34D" />
        <stop offset="80%" stopColor="#D97706" />
        <stop offset="100%" stopColor="#92400E" />
      </linearGradient>

      {/* A filling: cool, dense, and set into the tooth rather than laid on it. */}
      <radialGradient id="lt-amalgam" cx="0.5" cy="0.36" r="0.66">
        <stop offset="0%" stopColor="#BAE6FD" />
        <stop offset="42%" stopColor="#38BDF8" />
        <stop offset="76%" stopColor="#0284C7" />
        <stop offset="100%" stopColor="#075985" />
      </radialGradient>

      {/* The dentin body seen through the enamel: warm in the middle, gone by
          the edges. A gradient rather than a blurred shape, so the haze costs
          no filter pass. */}
      <radialGradient id="lt-dentin" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#d9b672" stopOpacity="0.52" />
        <stop offset="55%" stopColor="#dcbc7e" stopOpacity="0.34" />
        <stop offset="100%" stopColor="#e2c68f" stopOpacity="0" />
      </radialGradient>

      {/* Decay: black at the centre of the cavity, rusting out to the enamel. */}
      <radialGradient id="lt-caries" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#450A0A" />
        <stop offset="55%" stopColor="#9F1239" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#DC2626" stopOpacity="0.7" />
      </radialGradient>
      <radialGradient id="lt-caries-halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="45%" stopColor="#B45309" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
      </radialGradient>

      {/* The sealed access cavity on a root-treated tooth. */}
      <radialGradient id="lt-endo-access" cx="0.5" cy="0.35" r="0.7">
        <stop offset="0%" stopColor="#DDD6FE" />
        <stop offset="55%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#4C1D95" />
      </radialGradient>

      {/* A cylinder, and symmetrical about its axis so it survives the mirror:
          dark at both edges, bright down the core. */}
      <linearGradient id="lt-titanium" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stopColor="#115E59" />
        <stop offset="26%" stopColor="#14B8A6" />
        <stop offset="50%" stopColor="#99F6E4" />
        <stop offset="74%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#115E59" />
      </linearGradient>

      <linearGradient id="lt-ceramic" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#E2E8F0" />
        <stop offset="30%" stopColor="#FFFFFF" />
        <stop offset="70%" stopColor="#F8FAFC" />
        <stop offset="100%" stopColor="#CBD5E1" />
      </linearGradient>

      {/* The whole tooth — for a finding, which can sit anywhere on it. */}
      {VARIANTS.map((variant) => {
        const g = GEOMETRY.get(variant.key)!;
        return (
          <clipPath key={variant.key} id={`lt-clip-${variant.key}`}>
            <path d={g.crown} />
            {g.roots.map((root) => (
              <path key={root.d} d={root.d} />
            ))}
          </clipPath>
        );
      })}

      {/* The crown alone — a cap stops at the neck, and a filling in the root is
          not a thing. */}
      {VARIANTS.map((variant) => (
        <clipPath key={variant.key} id={`lt-crown-clip-${variant.key}`}>
          <path d={GEOMETRY.get(variant.key)!.crown} />
        </clipPath>
      ))}

      {/* The roots alone, so their own shading stops where the crown starts
          instead of washing a dark band across the neck. */}
      {VARIANTS.map((variant) => (
        <clipPath key={variant.key} id={`lt-root-clip-${variant.key}`}>
          {GEOMETRY.get(variant.key)!.roots.map((root) => (
            <path key={root.d} d={root.d} />
          ))}
        </clipPath>
      ))}

      {VARIANTS.map((variant) => (
        <clipPath key={variant.key} id={`lt-implant-clip-${variant.key}`}>
          <path d={GEOMETRY.get(variant.key)!.implant.body} />
        </clipPath>
      ))}

      {VARIANTS.map((variant) => (
        <ToothForm key={variant.key} variant={variant} />
      ))}
      {VARIANTS.map((variant) => (
        <ImplantForm key={`implant-${variant.key}`} variant={variant} />
      ))}
    </defs>
  </svg>
);

/**
 * The shared drawings, and the one place on the page that should hold them.
 *
 * Every `ToothGlyph` points into this by id, which browsers resolve
 * document-wide, the same way an icon sprite does — so one copy is all a page
 * can use. It costs **2,162 elements and about 450KB of markup**, which is
 * affordable exactly once and not twice.
 *
 * Three components mount it, because each has to work on its own: the chart,
 * the visit timeline, and the tooth picker. On the patient page all three are
 * on screen at the same time, so the page was shipping three copies — six and a
 * half thousand redundant nodes, and duplicate ids on every one of them, with
 * `url(#…)` quietly resolving to whichever came first.
 *
 * The deduping lives in `ToothDefsProvider.tsx` rather than here, and has to:
 * this module is imported by `VisitTimeline`, which is a server component, and
 * a `useContext` in here would make the whole of it — every gradient, filter
 * and modelled tooth — a client component and drag it into the bundle. So this
 * export stays hook-free and server-safe, and the context-aware wrapper next
 * door is what the client components use.
 */
export const TOOTH_DEFS = DEFS;

export function ToothDefs() {
  return DEFS;
}
