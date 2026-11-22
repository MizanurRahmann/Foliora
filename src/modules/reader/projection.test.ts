import { describe, expect, it } from "vitest";

import { chain, placeFace, placeQuad, shadeFor, project, rotateX, rotateY, scale, transformPoint, translate, triangleClips, type Affine, type FaceFrame, type View } from "./projection";

const front: FaceFrame = { w: 100, h: 200, origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] };
const flat: View = { ox: 0, oy: 0, invP: 0 };

describe("matrices", () => {
  it("rotate like CSS", () => {
    // rotateY(90deg) sends +x to -z and +z to +x.
    const y = transformPoint(rotateY(90), [1, 0, 0]);
    expect(y[0]).toBeCloseTo(0, 9);
    expect(y[2]).toBeCloseTo(-1, 9);
    const z = transformPoint(rotateY(90), [0, 0, 1]);
    expect(z[0]).toBeCloseTo(1, 9);
    // rotateX(90deg) sends +y to +z.
    const x = transformPoint(rotateX(90), [0, 1, 0]);
    expect(x[1]).toBeCloseTo(0, 9);
    expect(x[2]).toBeCloseTo(1, 9);
  });

  it("applies the rightmost matrix first", () => {
    const p = transformPoint(chain(translate(10, 0, 0), scale(2)), [1, 1, 1]);
    expect(p).toEqual([12, 2, 2]);
  });
});

describe("project", () => {
  it("leaves points on the vanishing plane alone and magnifies near ones", () => {
    const view: View = { ox: 0, oy: 0, invP: 1 / 1000 };
    expect(project([50, 20, 0], view)).toEqual({ x: 50, y: 20 });
    expect(project([50, 20, 500], view).x).toBeCloseTo(100, 6);
    expect(project([50, 20, -1000], view).x).toBeCloseTo(25, 6);
  });
});

describe("placeFace", () => {
  it("a face straight on is a plain translation, one to one", () => {
    const placed = placeFace(translate(30, 40, 0), front, flat);
    expect(placed.affine).toEqual([1, 0, 0, 1, 30, 40]);
    expect(placed.facing).toBeGreaterThan(0);
  });

  it("a parallel projection keeps depth from changing the size", () => {
    const placed = placeFace(translate(0, 0, 500), front, flat);
    expect(placed.affine.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(placed.depth).toBe(500);
  });

  it("turns away when rotated half a turn, and edge-on at a quarter turn", () => {
    expect(placeFace(rotateY(180), front, flat).facing).toBeLessThan(0);
    expect(Math.abs(placeFace(rotateY(90), front, flat).facing)).toBeLessThan(1e-6);
    expect(placeFace(rotateY(45), front, flat).facing).toBeGreaterThan(0);
  });

  it("foreshortens the width of a turned face by the cosine", () => {
    const placed = placeFace(rotateY(60), front, flat);
    expect(placed.affine[0]).toBeCloseTo(0.5, 6);
    expect(placed.affine[3]).toBeCloseTo(1, 6);
  });

  it("culls with the actual viewer position under perspective", () => {
    // A face to the right of the vanishing point, turned a little away from the centre.
    const view: View = { ox: 0, oy: 0, invP: 1 / 500 };
    const world = chain(translate(400, 0, 0), rotateY(-80));
    const placed = placeFace(world, { ...front, w: 50 }, view);
    // Seen from the centre, a face at x=400 turned toward it still faces the viewer.
    expect(placed.facing).toBeGreaterThan(0);
    expect(placeFace(chain(translate(400, 0, 0), rotateY(80)), { ...front, w: 50 }, view).facing).toBeLessThan(0);
  });

  it("fits the three corners it uses exactly", () => {
    const view: View = { ox: 0, oy: 0, invP: 1 / 800 };
    const world = chain(translate(100, 50, 0), rotateY(-35), rotateX(-10));
    const [a, b, c, d, e, f] = placeFace(world, front, view).affine;
    for (const [lx, ly] of [[0, 0], [100, 0], [0, 200]] as const) {
      const real = project(transformPoint(world, [lx, ly, 0]), view);
      expect(a * lx + c * ly + e).toBeCloseTo(real.x, 6);
      expect(b * lx + d * ly + f).toBeCloseTo(real.y, 6);
    }
  });
});

describe("placeQuad", () => {
  const view: View = { ox: 0, oy: 0, invP: 1 / 2400 };
  const hinge = chain(translate(150, -50, 0), rotateY(-45), rotateX(-10));
  const w = 35;
  const h = 796;
  const slice: FaceFrame = { ...front, w, h };
  const map = ([a, b, c, d, e, f]: Affine, lx: number, ly: number) => ({ x: a * lx + c * ly + e, y: b * lx + d * ly + f });
  const real = (world: typeof hinge, lx: number, ly: number) => project(transformPoint(world, [lx, ly, 0]), view);

  it("maps all four corners exactly, one triangle through three each", () => {
    const placed = placeQuad(hinge, slice, view);
    for (const [lx, ly] of [[0, 0], [w, 0], [0, h]] as const) {
      expect(map(placed.upper, lx, ly).x).toBeCloseTo(real(hinge, lx, ly).x, 6);
      expect(map(placed.upper, lx, ly).y).toBeCloseTo(real(hinge, lx, ly).y, 6);
    }
    for (const [lx, ly] of [[w, 0], [w, h], [0, h]] as const) {
      expect(map(placed.lower, lx, ly).x).toBeCloseTo(real(hinge, lx, ly).x, 6);
      expect(map(placed.lower, lx, ly).y).toBeCloseTo(real(hinge, lx, ly).y, 6);
    }
  });

  it("makes neighbouring slices meet exactly along their shared edge", () => {
    const next = chain(hinge, translate(w, 0, 0));
    const one = placeQuad(hinge, slice, view);
    const two = placeQuad(next, slice, view);
    // Right edge of the first (lower triangle) against the left edge of the next (upper triangle).
    for (const ly of [0, h / 3, h]) {
      expect(map(one.lower, w, ly).x).toBeCloseTo(map(two.upper, 0, ly).x, 6);
      expect(map(one.lower, w, ly).y).toBeCloseTo(map(two.upper, 0, ly).y, 6);
    }
  });

  it("reports facing and depth like a single face", () => {
    const single = placeFace(hinge, slice, view);
    const quad = placeQuad(hinge, slice, view);
    expect(quad.facing).toBeCloseTo(single.facing, 6);
    expect(quad.depth).toBeCloseTo(single.depth, 6);
  });
});

describe("triangleClips", () => {
  it("covers each triangle and a little more", () => {
    const { upper, lower } = triangleClips(20, 100, 1);
    expect(upper.startsWith("polygon(")).toBe(true);
    expect(lower.startsWith("polygon(")).toBe(true);
    // The upper triangle's corner is pushed out by the grow amount.
    expect(upper).toContain("-1.00px -1.00px");
    // The lower triangle reaches past the piece's bottom-right corner.
    expect(lower).toContain("21.00px 101.00px");
  });

  it("lets the lower triangle overlap into the next piece", () => {
    const { lower } = triangleClips(20, 100, 1, 3);
    expect(lower).toContain("23.00px 101.00px");
  });
});

describe("shadeFor", () => {
  it("leaves a face turned at the viewer unshaded and darkens faces turned away from the light", () => {
    expect(shadeFor([0, 0, 1])).toBe(0);
    // The light is from the upper left: the left side is lit better than the right.
    expect(shadeFor([-1, 0, 0])).toBeLessThan(shadeFor([1, 0, 0]));
    // The top better than the bottom.
    expect(shadeFor([0, -1, 0])).toBeLessThan(shadeFor([0, 1, 0]));
    expect(shadeFor([0, 0, -1])).toBeCloseTo(0.38, 6);
  });

  it("reports unit normals from placed faces", () => {
    const placed = placeFace(rotateY(30), front, flat);
    expect(Math.hypot(...placed.normal)).toBeCloseTo(1, 9);
    expect(placed.normal[2]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
  });
});
