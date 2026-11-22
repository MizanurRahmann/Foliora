import { describe, expect, it } from "vitest";

import { HOLD_T, PERSPECTIVE, geometryFor, phaseAt, poseAt, shelfScale, thicknessRatio, type Geometry } from "./bookPose";

const shelf = { x: 428, y: 43, w: 54, h: 198 };
const g: Geometry = geometryFor(shelf, 1440, 900, 0.705);

// Projects a point of the book box (relative to its centre) to the window with the pose's transform.
function project(point: [number, number, number], t: number) {
  const pose = poseAt(t, g);
  let [x, y, z] = point;
  [x, y, z] = [x * pose.k, y * pose.k, z * pose.k];
  const ry = (pose.ry * Math.PI) / 180;
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  const rx = (pose.rx * Math.PI) / 180;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  // The pose gives the book's centre in window coordinates.
  const cx = pose.x + x;
  const cy = pose.y + y;
  const cz = pose.z + z;
  const f = 1 / (1 - cz * pose.invP);
  const ox = g.vw / 2;
  const oy = g.vh / 2;
  return { x: ox + (cx - ox) * f, y: oy + (cy - oy) * f };
}

describe("geometry", () => {
  it("fits the open spread inside the window", () => {
    expect(2 * g.D).toBeLessThanOrEqual(1440);
    expect(g.H).toBeLessThanOrEqual(900);
    expect(g.D / g.H).toBeCloseTo(0.705, 3);
  });

  it("keeps the shelf spine proportions on the shelf, and a real thickness off it", () => {
    expect(g.T / g.H).toBeCloseTo(54 / 198, 3);
    expect(g.Tbook / g.H).toBeCloseTo(thicknessRatio(300), 6);
    expect(g.Tbook).toBeLessThan(g.T);
  });

  it("gives thicker books more thickness, within limits", () => {
    expect(thicknessRatio(100)).toBeLessThan(thicknessRatio(600));
    expect(thicknessRatio(1)).toBe(0.05);
    expect(thicknessRatio(100000)).toBe(0.13);
  });
});

describe("poseAt", () => {
  it("starts with the spine exactly over the shelf book", () => {
    const corners: [number, number, number][] = [
      [-g.D / 2, -g.H / 2, -g.T / 2],
      [-g.D / 2, -g.H / 2, g.T / 2],
      [-g.D / 2, g.H / 2, -g.T / 2],
      [-g.D / 2, g.H / 2, g.T / 2],
    ];
    const points = corners.map((corner) => project(corner, 0));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(shelf.x, 0);
    expect(Math.max(...xs)).toBeCloseTo(shelf.x + shelf.w, 0);
    expect(Math.min(...ys)).toBeCloseTo(shelf.y, 0);
    expect(Math.max(...ys)).toBeCloseTo(shelf.y + shelf.h, 0);
  });

  it("starts un-dimmed, closed and unlifted", () => {
    const p = poseAt(0, g);
    expect(p).toMatchObject({ dim: 0, lift: 0, open: 0, cover: -0, leaf: 0 });
    // Just short of edge-on, which some webviews refuse to paint.
    expect(p.ry).toBeCloseTo(89.6, 5);
    expect(p.k).toBeCloseTo(shelfScale(g), 6);
  });

  it("ends flat and exactly at rest", () => {
    const p = poseAt(1, g);
    expect(p.open).toBe(1);
    expect(p.k).toBeCloseTo(1, 9);
    expect(p.dim).toBe(1);
    expect(p.x).toBeCloseTo(g.vw / 2 + g.D / 2, 6);
    expect(p.y).toBeCloseTo(g.vh / 2, 6);
    expect(p.z).toBeCloseTo(0, 6);
    expect(p.ry).toBeCloseTo(0, 6);
    expect(p.rx).toBeCloseTo(0, 6);
    expect(p.cover).toBeCloseTo(-180, 6);
    expect(p.bend).toBeCloseTo(0, 6);
  });

  it("is closed and turned to face us when it waits for the PDF", () => {
    const p = poseAt(HOLD_T, g);
    expect(p.open).toBe(0);
    expect(p.ry).toBeCloseTo(0, 6);
    expect(p.k).toBeCloseTo(1, 6);
    // Centred on the window, the spine edge half a cover to the left of the centre.
    expect(p.x).toBeCloseTo(g.vw / 2, 6);
  });

  it("never opens the cover before the hold point, or turns after it", () => {
    for (let t = 0; t <= HOLD_T; t += 0.01) expect(poseAt(t, g).cover).toBeCloseTo(0, 9);
    for (let t = HOLD_T; t <= 1; t += 0.01) expect(poseAt(t, g).ry).toBeLessThanOrEqual(0.0001);
  });

  it("turns monotonically from the spine to the cover and opens monotonically", () => {
    let yaw = Infinity;
    let cover = 1;
    for (let t = 0; t <= HOLD_T; t += 0.005) {
      const p = poseAt(t, g);
      expect(p.ry).toBeLessThanOrEqual(yaw + 1e-9);
      yaw = p.ry;
    }
    for (let t = 0; t <= 1; t += 0.005) {
      const p = poseAt(t, g);
      expect(p.cover).toBeLessThanOrEqual(cover + 1e-9);
      cover = p.cover;
    }
  });

  it("moves without jumps", () => {
    let previous = poseAt(0, g);
    for (let t = 0.002; t <= 1; t += 0.002) {
      const p = poseAt(t, g);
      expect(Math.abs(p.x - previous.x)).toBeLessThan(25);
      expect(Math.abs(p.y - previous.y)).toBeLessThan(25);
      expect(Math.abs(p.z - previous.z)).toBeLessThan(25);
      expect(Math.abs(p.ry - previous.ry)).toBeLessThan(3);
      expect(Math.abs(p.k - previous.k)).toBeLessThan(0.03);
      previous = p;
    }
  });

  it("starts almost flat, settles on the full perspective, and ends flat again", () => {
    expect(1 / poseAt(0, g).invP).toBeGreaterThan(50000);
    expect(1 / poseAt(0.2, g).invP).toBeCloseTo(PERSPECTIVE, 3);
    // And none at all once the book lies open, so its pages are drawn one to one.
    expect(poseAt(1, g).invP).toBe(0);
  });

  it("thins to the real thickness and fades the title soon after it leaves the shelf", () => {
    expect(poseAt(0, g)).toMatchObject({ thin: 0, label: 1 });
    expect(poseAt(0.07, g).label).toBe(0);
    expect(poseAt(0.34, g).thin).toBe(1);
    // Both are done before the cover turns toward the viewer.
    expect(poseAt(HOLD_T, g)).toMatchObject({ thin: 1, label: 0 });
  });

  it("is the same pose whichever way time is running", () => {
    expect(poseAt(0.6, g)).toEqual(poseAt(0.6, g));
  });

  it("clamps time outside 0..1", () => {
    expect(poseAt(-1, g)).toEqual(poseAt(0, g));
    expect(poseAt(2, g)).toEqual(poseAt(1, g));
  });
});

describe("phaseAt", () => {
  it("runs through the phases in order", () => {
    const order = ["picking_up", "floating", "rotating", "opening"];
    let index = 0;
    for (let t = 0; t <= 1; t += 0.005) {
      const next = order.indexOf(phaseAt(t));
      expect(next).toBeGreaterThanOrEqual(index);
      index = next;
    }
    expect(phaseAt(0)).toBe("picking_up");
    expect(phaseAt(1)).toBe("opening");
  });
});
