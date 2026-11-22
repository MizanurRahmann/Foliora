import { describe, expect, it } from "vitest";

import { canClose, canNavigate, initialMachine, reduce, type Machine, type MachineEvent } from "./bookMachine";

const run = (events: MachineEvent[], from: Machine = initialMachine) => events.reduce(reduce, from);

describe("book machine", () => {
  it("plays through the whole opening in order", () => {
    let m = initialMachine;
    const seen: string[] = [m.state];
    for (const event of [
      { type: "CLICK" },
      { type: "PHASE", phase: "floating" },
      { type: "PHASE", phase: "rotating" },
      { type: "READY" },
      { type: "PHASE", phase: "opening" },
      { type: "ARRIVED" },
    ] as MachineEvent[]) {
      m = reduce(m, event);
      seen.push(m.state);
    }
    expect(seen).toEqual(["idle", "picking_up", "floating", "rotating", "rotating", "opening", "reading"]);
  });

  it("ignores a second click while anything is happening", () => {
    for (const events of [
      [{ type: "CLICK" }],
      [{ type: "CLICK" }, { type: "PHASE", phase: "rotating" }],
      [{ type: "CLICK" }, { type: "PHASE", phase: "opening" }, { type: "ARRIVED" }],
      [{ type: "CLICK" }, { type: "CLOSE" }],
    ] as MachineEvent[][]) {
      const before = run(events);
      expect(reduce(before, { type: "CLICK" })).toBe(before);
    }
  });

  it("never moves a phase backwards or skips out of flight", () => {
    const m = run([{ type: "CLICK" }, { type: "PHASE", phase: "rotating" }]);
    expect(reduce(m, { type: "PHASE", phase: "floating" })).toBe(m);
    expect(reduce(initialMachine, { type: "PHASE", phase: "floating" })).toBe(initialMachine);
    const reading = run([{ type: "CLICK" }, { type: "PHASE", phase: "opening" }, { type: "ARRIVED" }]);
    expect(reduce(reading, { type: "PHASE", phase: "opening" })).toBe(reading);
  });

  it("only arrives from the opening phase", () => {
    const early = run([{ type: "CLICK" }, { type: "PHASE", phase: "rotating" }]);
    expect(reduce(early, { type: "ARRIVED" })).toBe(early);
  });

  it("can be closed from any flight phase or from reading, then returns to idle", () => {
    for (const phase of ["floating", "rotating", "opening"] as const) {
      const m = run([{ type: "CLICK" }, { type: "PHASE", phase }]);
      expect(canClose(m)).toBe(true);
      const closing = reduce(m, { type: "CLOSE" });
      expect(closing.state).toBe("closing");
      expect(closing.hasFailed).toBe(false);
      expect(reduce(closing, { type: "CLOSED" }).state).toBe("idle");
    }
    const reading = run([{ type: "CLICK" }, { type: "PHASE", phase: "opening" }, { type: "ARRIVED" }]);
    expect(reduce(reading, { type: "CLOSE" }).state).toBe("closing");
  });

  it("ignores close when idle or already closing, and a stray CLOSED", () => {
    expect(reduce(initialMachine, { type: "CLOSE" })).toBe(initialMachine);
    expect(reduce(initialMachine, { type: "CLOSED" })).toBe(initialMachine);
    const closing = run([{ type: "CLICK" }, { type: "CLOSE" }]);
    expect(reduce(closing, { type: "CLOSE" })).toBe(closing);
    expect(canClose(closing)).toBe(false);
  });

  it("a failure sends the book back and remembers why", () => {
    const m = run([{ type: "CLICK" }, { type: "PHASE", phase: "rotating" }, { type: "FAIL" }]);
    expect(m).toMatchObject({ state: "closing", hasFailed: true });
    // A failure after the book is open is not a loading failure.
    const reading = run([{ type: "CLICK" }, { type: "PHASE", phase: "opening" }, { type: "ARRIVED" }]);
    expect(reduce(reading, { type: "FAIL" })).toBe(reading);
  });

  it("allows page navigation only while reading", () => {
    expect(canNavigate(initialMachine)).toBe(false);
    expect(canNavigate(run([{ type: "CLICK" }]))).toBe(false);
    expect(canNavigate(run([{ type: "CLICK" }, { type: "PHASE", phase: "opening" }, { type: "ARRIVED" }]))).toBe(true);
  });

  it("records readiness once", () => {
    const m = run([{ type: "CLICK" }, { type: "READY" }]);
    expect(m.isReady).toBe(true);
    expect(reduce(m, { type: "READY" })).toBe(m);
  });
});
