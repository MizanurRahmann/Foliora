// A small software 3D pipeline: 4x4 matrices, perspective, and a fit of each face to a flat 2D
// transform.
//
// The book is drawn this way rather than with CSS `preserve-3d` because WebKit without GPU
// compositing (a Linux container, a VM) ignores `preserve-3d`: every face collapses onto one flat
// sheet and the book disappears. Plain 2D `matrix()` transforms render the same everywhere.
//
// Conventions match CSS: x to the right, y down, z toward the viewer; rotateX/rotateY use CSS's signs.

export type Vec3 = readonly [number, number, number];
// Row-major 4x4, applied to column vectors.
export type Mat4 = readonly number[];

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

export const chain = (...matrices: Mat4[]): Mat4 => matrices.reduce(multiply, identity());

export const translate = (x: number, y: number, z: number): Mat4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const scale = (k: number): Mat4 => [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1];

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotateX(deg: number): Mat4 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

export function rotateY(deg: number): Mat4 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}

export function transformPoint(m: Mat4, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

// The viewer: the vanishing point (ox, oy) and the inverse of the perspective distance. 0 is
// a parallel projection, which keeps the finished, flat page exactly 1:1.
export interface View {
  ox: number;
  oy: number;
  invP: number;
}

export function project([x, y, z]: Vec3, view: View): { x: number; y: number } {
  const f = 1 / (1 - z * view.invP);
  return { x: view.ox + (x - view.ox) * f, y: view.oy + (y - view.oy) * f };
}

// A flat rectangle in the book: `w` px along `u` and `h` px along `v` from `origin`. Its outward
// normal is u × v.
export interface FaceFrame {
  w: number;
  h: number;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

export type Affine = readonly [number, number, number, number, number, number];

export interface PlacedFace {
  // CSS matrix(a, b, c, d, e, f) taking the face's own pixels (origin at its top-left) to the screen.
  affine: Affine;
  // Unit outward normal in scene coordinates, for lighting.
  normal: Vec3;
  // Positive when the outward side faces the viewer.
  facing: number;
  // Larger is nearer the viewer.
  depth: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Places a face: `world` takes the book's own coordinates to the scene. The face is fitted with a
// flat transform through three of its projected corners, which is exact for those corners and for
// the two edges between them. That is right for small or square-on faces. A face that is large
// and strongly foreshortened should use `placeQuad` instead.
export function placeFace(world: Mat4, frame: FaceFrame, view: View): PlacedFace {
  const { w, h } = frame;
  const { corners, facing, depth, normal } = corners3d(world, frame, view);
  const [s0, s1, s2] = corners;
  return {
    affine: [(s1.x - s0.x) / w, (s1.y - s0.y) / w, (s2.x - s0.x) / h, (s2.y - s0.y) / h, s0.x, s0.y],
    normal,
    facing,
    depth,
  };
}

interface Corners {
  // Projected corners: top-left, top-right, bottom-left, bottom-right.
  corners: [Pt, Pt, Pt, Pt];
  normal: Vec3;
  facing: number;
  depth: number;
}
type Pt = { x: number; y: number };

function corners3d(world: Mat4, frame: FaceFrame, view: View): Corners {
  const { w, h, origin, u, v } = frame;
  const at = (lx: number, ly: number): Vec3 =>
    transformPoint(world, [origin[0] + u[0] * lx + v[0] * ly, origin[1] + u[1] * lx + v[1] * ly, origin[2] + u[2] * lx + v[2] * ly]);

  const p0 = at(0, 0);
  const p1 = at(w, 0);
  const p2 = at(0, h);
  const p3 = at(w, h);

  const normal = cross(sub(p1, p0), sub(p2, p0));
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const towardViewer: Vec3 = view.invP > 0 ? [view.ox - p0[0], view.oy - p0[1], 1 / view.invP - p0[2]] : [0, 0, 1];
  return {
    corners: [project(p0, view), project(p1, view), project(p2, view), project(p3, view)],
    normal: [normal[0] / length, normal[1] / length, normal[2] / length],
    facing: dot(normal, towardViewer),
    depth: (p1[2] + p2[2]) / 2,
  };
}

export interface PlacedQuad {
  // The upper-left triangle (corners 0, 1, 2) and the lower-right triangle (corners 1, 3, 2).
  upper: Affine;
  lower: Affine;
  normal: Vec3;
  facing: number;
  depth: number;
}

// Places a face as two triangles, each mapped exactly through its own three projected corners.
// Neighbouring pieces then share their edges exactly, however strong the perspective; a single flat
// fit would leave steps between them. Draw each triangle clipped to `triangleClips`.
export function placeQuad(world: Mat4, frame: FaceFrame, view: View): PlacedQuad {
  const { w, h } = frame;
  const { corners, facing, depth, normal } = corners3d(world, frame, view);
  const [s0, s1, s2, s3] = corners;
  const upper: Affine = [(s1.x - s0.x) / w, (s1.y - s0.y) / w, (s2.x - s0.x) / h, (s2.y - s0.y) / h, s0.x, s0.y];
  // Local (w, h) maps to s3, (0, h) to s2 and (w, 0) to s1.
  const a = (s3.x - s2.x) / w;
  const b = (s3.y - s2.y) / w;
  const c = (s3.x - s1.x) / h;
  const d = (s3.y - s1.y) / h;
  const lower: Affine = [a, b, c, d, s3.x - a * w - c * h, s3.y - b * w - d * h];
  return { upper, lower, normal, facing, depth };
}

// CSS clip-path polygons for the two triangles of a w x h piece, grown outward by `grow` px so the
// seam along the diagonal does not show as a hairline. The lower triangle also reaches `overlap` px
// past the right edge, into the next piece, so neighbouring pieces overlap instead of meeting at an
// anti-aliased edge (the box must be that much wider for it to paint).
export function triangleClips(w: number, h: number, grow: number, overlap = grow): { upper: string; lower: string } {
  const delta = grow * Math.hypot(1 / w, 1 / h);
  const px = (n: number) => `${n.toFixed(2)}px`;
  const pt = (x: number, y: number) => `${px(x)} ${px(y)}`;
  const upper = [
    pt(-grow, -grow),
    pt(w * (1 + delta + grow / h), -grow),
    pt(-grow, h * (1 + delta + grow / w)),
  ];
  const lower = [
    pt(w + overlap, -h * (delta + (grow + overlap) / w)),
    pt(w + overlap, h + grow),
    pt(-w * (delta + grow / h), h + grow),
  ];
  return { upper: `polygon(${upper.join(", ")})`, lower: `polygon(${lower.join(", ")})` };
}

export const cssMatrix = ([a, b, c, d, e, f]: Affine) =>
  `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${d.toFixed(5)}, ${e.toFixed(2)}, ${f.toFixed(2)})`;

// Light from the upper left, in front of the book (y points down).
const LIGHT: Vec3 = (() => {
  const v: Vec3 = [-0.3, -0.45, 1];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

// How much darker than a face turned straight at the viewer a face with this normal is, from 0
// (as lit as the front) to `max`. A face turned toward the light is never brighter than the front,
// so the finished, flat book is drawn without any shading at all.
export function shadeFor(normal: Vec3, max = 0.38): number {
  const front = LIGHT[2];
  const lit = dot(normal, LIGHT);
  return Math.min(Math.max((front - lit) / front, 0), 1) * max;
}
