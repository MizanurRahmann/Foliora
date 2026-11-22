// The whole pick-up-and-open motion as one pure function of time. Playing it forwards opens the
// book and playing it backwards closes it, so the two directions are the same animation.
//
// t runs from 0 (the book on its shelf) to 1 (the open book, flat in front of the reader).
// The phases overlap a little so the motion flows instead of stopping between steps.
//
// The book is modelled in its reading pose: cover toward the viewer, spine on the left. On the
// shelf it is turned 90° about the vertical axis, so only its spine faces us.

// The perspective settles at PERSPECTIVE; on the shelf it is almost none, so the book looks as flat
// as its neighbours until it starts to move, and it fades out again as the book lies open.
export const PERSPECTIVE = 2400;

// The turn stops a hair short of 90° so the shelf pose is never exactly edge-on, which some
// webviews do not paint. The half-pixel this would move the spine is cancelled below.
const MAX_YAW = 89.6;
const FAR_PERSPECTIVE = 60000;
// About 1.3 s from shelf to open book.
export const FULL_MS = 1300;

export const WINDOWS = {
  pick: [0, 0.2],
  float: [0.06, 0.42],
  // The turn starts while the book is still travelling, so it is cover-first soon after leaving.
  rotate: [0.16, 0.62],
  open: [0.62, 1],
} as const;

// The float is two movements: it travels to the middle first and only then grows, so it never
// swells off the top of the window on its way down from an upper shelf.
const TRAVEL: PoseWindow = [0.06, 0.4];
const GROW: PoseWindow = [0.12, 0.46];
const SETTLE: PoseWindow = [0, 0.2];
// The shelf only shows a stylised spine, so the book thins to its real thickness as it leaves.
const THIN: PoseWindow = [0.04, 0.34];
// The title on the spine fades out as soon as the book is picked up.
const LABEL_FADE: PoseWindow = [0, 0.07];

// Where the book waits for the PDF before it opens its cover.
export const HOLD_T = WINDOWS.open[0];

// Time at which each phase hands over to the next.
const PHASE_BOUNDS = [0.14, 0.34, HOLD_T] as const;

export type PoseWindow = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  // The book box in px at reading size: D wide (cover), H tall. T is its thickness on the shelf,
  // where the spine is as wide as its slot; Tbook is its real thickness, from its page count.
  D: number;
  H: number;
  T: number;
  Tbook: number;
  vw: number;
  vh: number;
  // The book's rectangle on the shelf, in window coordinates.
  shelf: Rect;
}

export interface Pose {
  // Centre of the book in window coordinates, and depth toward the viewer.
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  k: number;
  // Cover angle in degrees (0 closed, -180 open) and the bend between its slices.
  cover: number;
  bend: number;
  // 0 closed, 1 open.
  open: number;
  // Inverse of the perspective distance (0 is a parallel projection). It reaches exactly 0 when the
  // book lies open, so the finished pages are drawn one to one.
  invP: number;
  // How dark the room behind the book is, how far it is off the shelf, and how visible the left page is.
  dim: number;
  lift: number;
  leaf: number;
  // 0 at shelf thickness, 1 at the book's real thickness.
  thin: number;
  // Opacity of the title on the spine.
  label: number;
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const easeInOut = (x: number) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
const progress = (t: number, [from, to]: PoseWindow) => clamp01((t - from) / (to - from));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const f = clamp01((x - edge0) / (edge1 - edge0));
  return f * f * (3 - 2 * f);
};
const rad = (deg: number) => (deg * Math.PI) / 180;

// Real thickness over height: a 300-page book is about 8% as thick as it is tall.
export const thicknessRatio = (pageCount: number) =>
  Math.min(Math.max(0.035 + pageCount / 6000, 0.05), 0.13);

// Dimensions of the book box for a window and a shelf rectangle. `aspect` is cover width / height.
export function geometryFor(shelf: Rect, vw: number, vh: number, aspect: number, pageCount = 300): Geometry {
  const D = Math.min((vw * 0.78) / 2, vh * 0.9 * aspect);
  const H = D / aspect;
  // On the shelf, thickness follows the spine so the book looks the same before it moves.
  const T = Math.min((H * shelf.w) / shelf.h, D * 1.2);
  const Tbook = H * thicknessRatio(pageCount);
  return { D, H, T, Tbook, vw, vh, shelf };
}

// The shelf scale: how much smaller the reading-size book is on the shelf.
export const shelfScale = (g: Geometry) => g.shelf.h / g.H;

export function poseAt(rawT: number, g: Geometry): Pose {
  const t = clamp01(rawT);
  const pick = easeInOut(progress(t, WINDOWS.pick));
  const float = easeInOut(progress(t, WINDOWS.float));
  const travel = easeInOut(progress(t, TRAVEL));
  const grow = easeInOut(progress(t, GROW));
  const rotate = easeInOut(progress(t, WINDOWS.rotate));
  const open = easeInOut(progress(t, WINDOWS.open));

  const cx = g.vw / 2;
  const cy = g.vh / 2;
  const shelfX = g.shelf.x + g.shelf.w / 2;
  const shelfY = g.shelf.y + g.shelf.h / 2;

  const kShelf = shelfScale(g);
  const kFloat = Math.min((0.72 * g.vh) / g.H, 1);
  const k = kShelf + (kFloat - kShelf) * grow + (1 - kFloat) * rotate;

  // Up and toward the viewer as it leaves the slot, easing off as it travels to the middle.
  const hover = pick * (1 - travel);
  const liftUp = g.vh * 0.05;
  const liftOut = 420;

  const wantedYaw = 90 * (1 - rotate);
  const yaw = Math.min(wantedYaw, MAX_YAW);
  // Keeps the spine where the 90° pose would have put it.
  const spineFix = ((k * g.D) / 2) * (Math.cos(rad(yaw)) - Math.cos(rad(wantedYaw)));
  const x = lerp(shelfX, cx, travel) + (g.D / 2) * open + spineFix;
  const y = lerp(shelfY, cy, travel) - liftUp * hover;
  // Keeps the face that is nearest the viewer in the shelf's plane while the book is turned.
  const z = -((k * g.D) / 2) * Math.sin(rad(yaw)) + liftOut * hover;

  return {
    x,
    y,
    z,
    // The top edge tips toward us mid-turn, so the book reads as a solid.
    rx: -14 * Math.sin(Math.PI * rotate),
    ry: yaw - 7 * Math.sin(Math.PI * open),
    k,
    cover: -180 * open,
    bend: 9 * Math.sin(Math.PI * open),
    open,
    invP:
      lerp(1 / FAR_PERSPECTIVE, 1 / PERSPECTIVE, easeInOut(progress(t, SETTLE))) *
      (1 - smoothstep(0.78, 1, t)),
    dim: float,
    lift: pick * (1 - open),
    leaf: smoothstep(0.94, 1, open),
    thin: easeInOut(progress(t, THIN)),
    label: 1 - easeInOut(progress(t, LABEL_FADE)),
  };
}

export function phaseAt(t: number): "picking_up" | "floating" | "rotating" | "opening" {
  if (t < PHASE_BOUNDS[0]) return "picking_up";
  if (t < PHASE_BOUNDS[1]) return "floating";
  if (t < PHASE_BOUNDS[2]) return "rotating";
  return "opening";
}
