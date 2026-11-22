import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";

import "./Book3D.scss";

import type { BookSummary } from "../shelf/types";
import type { Geometry, Pose } from "./bookPose";
import {
  chain,
  cssMatrix,
  placeFace,
  placeQuad,
  rotateX,
  shadeFor,
  rotateY,
  scale,
  translate,
  triangleClips,
  type FaceFrame,
  type Mat4,
  type Vec3,
  type View,
} from "./projection";

// The cover is cut into slices that hinge on each other, so it can bend while it swings open. Narrow
// slices also keep the flat fit of each one close to the true perspective shape.
const SLICES = 16;

// How much smaller than the cover the pages are while the book is closed.
const PAGE_INSET = 0.025;

// How far each cover slice reaches into the next, in px, so no seam shows between them.
const SLICE_OVERLAP = 3;

// Below this angle (in degrees) the cover counts as open: its inside and the page under it can be
// seen. While it is shut they are hidden, as they would be inside a real closed book.
const OPEN_ANGLE = -0.5;

// Faces that are drawn as two exactly placed triangles. Seen nearly edge-on, a single flat fit of
// a large face misses its far corner by many pixels and leaves notches where it meets the spine.
const SOLID_FACES = ["back", "fore", "top", "bottom"] as const;

export interface Book3DHandle {
  // Poses the book. `null` is the finished, flat, open book.
  apply: (pose: Pose | null) => void;
}

interface Book3DProps {
  book: BookSummary;
  // Size and placement for the animation (at zoom 1).
  geometry: Geometry;
  // The reader's zoom: scales the finished book without touching the animation.
  zoom: number;
  left: ReactNode;
  right: ReactNode;
}

type ColorStyles = CSSProperties & { "--primary": string; "--secondary": string };

// The finished pose: open, lying flat, in parallel projection.
const FINAL_POSE: Pose = {
  x: 0, y: 0, z: 0, rx: 0, ry: 0, k: 1, cover: -180, bend: 0, open: 1, invP: 0, dim: 1, lift: 0, leaf: 1,
  thin: 1, label: 0,
};

const X: [number, number, number] = [1, 0, 0];
const Y: [number, number, number] = [0, 1, 0];
const Z: [number, number, number] = [0, 0, 1];
const neg = (v: [number, number, number]): [number, number, number] => [-v[0], -v[1], -v[2]];

// A book drawn as flat pieces with plain 2D transforms: spine, covers, page edges, and a cover that
// opens about the spine. Nothing here uses CSS 3D (see projection.ts for why).
//
// Model coordinates: the reading pose, cover toward the viewer, spine on the left. The box spans
// x 0..D, y 0..H, and z -T/2..T/2; the shelf pose is a 90° turn of it about the vertical axis.
const Book3D = forwardRef<Book3DHandle, Book3DProps>(function Book3D({ book, geometry, zoom, left, right }, ref) {
  const pieces = useRef(new Map<string, HTMLElement>());
  const lastPoseRef = useRef<Pose | null>(null);

  const D = geometry.D * zoom;
  const H = geometry.H * zoom;
  const sliceWidth = D / SLICES;
  const { shelf } = geometry;

  const register = (name: string) => (element: HTMLElement | null) => {
    if (element) pieces.current.set(name, element);
    else pieces.current.delete(name);
  };

  const apply = (pose: Pose | null) => {
    lastPoseRef.current = pose;
    const p = pose ?? FINAL_POSE;
    const isFinal = pose === null || p.open >= 1;

    // The pose gives the book's centre in window coordinates; the book's resting place, open and
    // centred on the spine, is half a cover right of the window's middle.
    const offsetX = isFinal ? 0 : p.x - (geometry.vw / 2 + geometry.D / 2);
    const offsetY = isFinal ? 0 : p.y - geometry.vh / 2;

    // Book coordinates -> scene coordinates. The scene is as wide as the open book, so the
    // vanishing point (the window's middle) is at (D, H/2).
    const actor = chain(
      translate(1.5 * D + offsetX, H / 2 + offsetY, p.z),
      rotateX(p.rx),
      rotateY(p.ry),
      scale(p.k),
      translate(-D / 2, -H / 2, 0),
    );
    const view: View = { ox: D, oy: H / 2, invP: p.invP };

    const cover = isFinal ? -180 : p.cover;
    const bend = isFinal ? 0 : p.bend;
    const leaf = isFinal ? 1 : p.leaf;
    const isOpening = cover < OPEN_ANGLE;

    // The book's thickness changes as it leaves the shelf, so the pieces that span it are resized here.
    const T = (geometry.T + (geometry.Tbook - geometry.T) * (isFinal ? 1 : p.thin)) * zoom;
    const boardThickness = Math.max(2, Math.min(T * 0.04, 8));
    const size = (name: string, width: number, height: number) => {
      const element = pieces.current.get(name);
      if (!element) return;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    };
    size("spine", T, H);
    const sides: Record<(typeof SOLID_FACES)[number], [number, number]> = {
      back: [D, H],
      fore: [T, H],
      top: [D, T],
      bottom: [D, T],
    };
    for (const name of SOLID_FACES) {
      const [width, height] = sides[name];
      const clips = triangleClips(width, height, 0.75);
      for (const half of ["A", "B"] as const) {
        size(`${name}${half}`, width, height);
        const element = pieces.current.get(`${name}${half}`);
        if (element) element.style.clipPath = half === "A" ? clips.upper : clips.lower;
      }
    }
    const spineArt = pieces.current.get("spineArt");
    if (spineArt) spineArt.style.transform = `scale(${T / shelf.w}, ${H / shelf.h})`;
    // Picking the book up fades its title and bands away, leaving a plain cover in its own colour.
    const spineBlank = pieces.current.get("spineBlank");
    if (spineBlank) spineBlank.style.opacity = String(isFinal ? 1 : 1 - p.label);
    // The right page rises from under the cover to the left page's depth, so the open spread is
    // exactly flat and both pages are the same size.
    const rightZ = T / 2 - boardThickness - 1 + (boardThickness + 2) * leaf;

    interface Piece {
      name: string;
      world: Mat4;
      frame: FaceFrame;
      // Seen from its outward side (true) or from behind (false).
      showWhenFacing: boolean;
    }
    const list: Piece[] = [];
    const add = (name: string, world: Mat4, frame: FaceFrame, showWhenFacing = true) =>
      list.push({ name, world, frame, showWhenFacing });

    add("spine", actor, { w: T, h: H, origin: [0, 0, -T / 2], u: Z, v: Y });
    const solidFrames: Record<(typeof SOLID_FACES)[number], FaceFrame> = {
      back: { w: D, h: H, origin: [D, 0, -T / 2], u: neg(X), v: Y },
      fore: { w: T, h: H, origin: [D, 0, T / 2], u: neg(Z), v: Y },
      top: { w: D, h: T, origin: [0, 0, -T / 2], u: X, v: Z },
      bottom: { w: D, h: T, origin: [0, H, T / 2], u: X, v: neg(Z) },
    };
    // Like a real book, the pages are a little smaller than the cover until it lies open. That also
    // hides the few pixels by which a flat fit of the page differs from the cover's exact edges.
    const pageScale = 1 - PAGE_INSET * (1 - leaf);
    add("right", actor, {
      w: D,
      h: H,
      origin: [0, (H * (1 - pageScale)) / 2, rightZ],
      u: [pageScale, 0, 0],
      v: [0, pageScale, 0],
    });
    add("left", actor, { w: D, h: H, origin: [-D, 0, T / 2 + 1], u: X, v: Y });

    // The cover: each slice hinges on the free edge of the one before it. A slice is two triangles,
    // each placed exactly, so neighbouring slices meet along their shared edge with no steps.
    interface Slice {
      index: number;
      world: Mat4;
    }
    const slices: Slice[] = [];
    let hinge: Mat4 = chain(actor, translate(0, 0, T / 2), rotateY(cover));
    for (let i = 0; i < SLICES; i++) {
      if (i > 0) hinge = chain(hinge, translate(sliceWidth, 0, 0), rotateY(bend));
      slices.push({ index: i, world: hinge });
    }

    const sliceFrame: FaceFrame = { w: sliceWidth, h: H, origin: [0, 0, 0], u: X, v: Y };

    // Darkens a piece by how far it is turned from the light, so the book reads as a solid.
    const shade = (name: string, normal: Vec3) => {
      const overlay = pieces.current.get(`${name}Shade`);
      if (overlay) overlay.style.opacity = isFinal ? "0" : shadeFor(normal).toFixed(3);
    };
    const flip = (n: Vec3): Vec3 => [-n[0], -n[1], -n[2]];

    // Draw the faces that point at the viewer, farthest first, so nearer ones paint over them.
    const visible: { name: string; depth: number }[] = [];
    for (const name of SOLID_FACES) {
      const placed = placeQuad(actor, solidFrames[name], view);
      const isShown = placed.facing > 0;
      for (const half of ["A", "B"] as const) {
        const element = pieces.current.get(`${name}${half}`);
        if (!element) continue;
        element.style.visibility = isShown ? "visible" : "hidden";
        if (!isShown) continue;
        element.style.transform = cssMatrix(half === "A" ? placed.upper : placed.lower);
        shade(`${name}${half}`, placed.normal);
        visible.push({ name: `${name}${half}`, depth: placed.depth });
      }
    }
    for (const { name, world, frame, showWhenFacing } of list) {
      const element = pieces.current.get(name);
      if (!element) continue;
      const placed = placeFace(world, frame, view);
      // The page under the cover only shows once the cover has started to open. A shut cover
      // hides it, and as a single flat piece it would not line up with the cover's exact edges.
      const isBlocked = name === "right" && !isOpening;
      const isShown = !isBlocked && (showWhenFacing ? placed.facing > 0 : placed.facing < 0);
      if (!isShown) {
        element.style.visibility = "hidden";
        continue;
      }
      element.style.visibility = "visible";
      element.style.transform = cssMatrix(placed.affine);
      shade(name, showWhenFacing ? placed.normal : flip(placed.normal));
      visible.push({ name, depth: placed.depth });
    }
    // The cover slices. Each is shaded with a gradient running from its neighbours' shading on one
    // side to the other's, so the curve of a bending cover shades smoothly instead of in bands.
    const placedSlices = slices.map(({ world }) => placeQuad(world, sliceFrame, view));
    const shadeRamp = (values: number[], i: number): [number, number] => [
      i === 0 ? values[0] : (values[i - 1] + values[i]) / 2,
      i === values.length - 1 ? values[i] : (values[i] + values[i + 1]) / 2,
    ];
    const outsideShades = placedSlices.map((placed) => (isFinal ? 0 : shadeFor(placed.normal)));
    const insideShades = placedSlices.map((placed) => (isFinal ? 0 : shadeFor(flip(placed.normal))));
    const gradient = ([from, to]: [number, number]) =>
      `linear-gradient(90deg, rgba(0, 0, 0, ${from.toFixed(3)}) 0, rgba(0, 0, 0, ${to.toFixed(3)}) ${sliceWidth.toFixed(1)}px)`;

    placedSlices.forEach((placed, index) => {
      const sides: [string, boolean, number[]][] = [
        ["out", placed.facing > 0, outsideShades],
        // The inside of a shut cover lies against the pages and cannot be seen.
        ["in", isOpening && placed.facing < 0, insideShades],
      ];
      for (const [side, isShown, shades] of sides) {
        for (const half of ["A", "B"] as const) {
          const name = `${side}${half}${index}`;
          const element = pieces.current.get(name);
          if (!element) continue;
          element.style.visibility = isShown ? "visible" : "hidden";
          if (!isShown) continue;
          element.style.transform = cssMatrix(half === "A" ? placed.upper : placed.lower);
          const overlay = pieces.current.get(`${name}Shade`);
          if (overlay) {
            overlay.style.opacity = "1";
            overlay.style.background = gradient(shadeRamp(shades, index));
          }
          visible.push({ name, depth: placed.depth });
        }
      }
    });
    // Which piece is over which is fixed by how the book is built, so the stacking uses layers: the
    // box faces (which never overlap each other once the far ones are culled), then the right-hand
    // page, then the cover, then the left-hand page. Sorting whole pieces by depth would put a big
    // page over the cover's far end. Only the cover slices are ordered by depth, among themselves.
    const layerOf = (name: string) => {
      if (name === "left") return 3000;
      if (name === "right") return 1000;
      if (/^(out|in)[AB]\d+$/.test(name)) return 2000;
      return 1;
    };
    visible.sort((a, b) => layerOf(a.name) - layerOf(b.name) || a.depth - b.depth);
    visible.forEach(({ name }, index) => {
      const element = pieces.current.get(name);
      if (element) element.style.zIndex = String(index + 1);
    });

    // The left page only shows once the cover has come to rest over it.
    const leftLeaf = pieces.current.get("left");
    if (leftLeaf) leftLeaf.style.opacity = String(leaf);
    const root = pieces.current.get("root");
    if (root) root.style.setProperty("--open", String(isFinal ? 1 : p.open));
  };

  useImperativeHandle(ref, () => ({ apply }));

  // A new size or shelf position re-poses the book, so nothing jumps.
  useLayoutEffect(() => {
    apply(lastPoseRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D, H, geometry]);

  const colors: ColorStyles = { "--primary": book.primaryColor, "--secondary": book.secondaryColor };
  const coverClass = `book book--${book.coverStyle.toLowerCase().replace(/_/g, "-")}`;
  const hidden: CSSProperties = { visibility: "hidden" };
  const clips = useMemo(() => triangleClips(sliceWidth, H, 0.75, SLICE_OVERLAP), [sliceWidth, H]);

  return (
    <div ref={register("root")} className="b3d" style={{ ...colors, width: 2 * D, height: H }} aria-hidden="true">
      {SOLID_FACES.map((name) =>
        (["A", "B"] as const).map((half) => (
          <div
            key={`${name}${half}`}
            ref={register(`${name}${half}`)}
            className={`b3d__piece ${name === "back" ? "b3d__back" : `b3d__pages b3d__pages--${name}`}`}
            style={hidden}
          >
            <i ref={register(`${name}${half}Shade`)} className="b3d__shade" />
          </div>
        )),
      )}

      {/* The page under the cover; the right-hand page once the cover is open. */}
      <div ref={register("right")} className="b3d__piece b3d__leaf" style={{ ...hidden, width: D, height: H }}>
        {right}
        <span className="b3d__binding b3d__binding--right" />
      </div>

      {/* Sizes that depend on the thickness are set while posing, since it changes as the book moves. */}
      <div ref={register("spine")} className="b3d__piece b3d__spine" style={hidden}>
        <div ref={register("spineArt")} className="b3d__spine-art" style={{ width: shelf.w, height: shelf.h }}>
          <div className={coverClass} style={{ ...colors, width: shelf.w, height: shelf.h, cursor: "default" }}>
            <span className="book__title">{book.title}</span>
          </div>
        </div>
        <div ref={register("spineBlank")} className="b3d__spine-blank" />
        <i ref={register("spineShade")} className="b3d__shade" />
      </div>

      {Array.from({ length: SLICES }, (_, i) =>
        (["A", "B"] as const).map((half) => (
          <div key={`${i}${half}`}>
            <div
              ref={register(`out${half}${i}`)}
              className="b3d__piece b3d__outside"
              style={{
                ...hidden,
                // Wider than the geometry it is mapped by, so neighbours overlap.
                width: sliceWidth + SLICE_OVERLAP,
                height: H,
                clipPath: clips[half === "A" ? "upper" : "lower"],
              }}
            >
              <i ref={register(`out${half}${i}Shade`)} className="b3d__shade" />
            </div>
            <div
              ref={register(`in${half}${i}`)}
              className="b3d__piece b3d__inside"
              style={{ ...hidden, width: sliceWidth + SLICE_OVERLAP, height: H, clipPath: clips[half === "A" ? "upper" : "lower"] }}
            >
              <i ref={register(`in${half}${i}Shade`)} className="b3d__shade" />
            </div>
          </div>
        )),
      )}

      {/* The left-hand page lies on the inside of the opened cover. */}
      <div ref={register("left")} className="b3d__piece b3d__leaf" style={{ ...hidden, width: D, height: H, opacity: 0 }}>
        {left}
        <span className="b3d__binding b3d__binding--left" />
      </div>
    </div>
  );
});

export default Book3D;
