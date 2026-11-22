// The life of one reading session as a state machine. It does not animate anything; it decides
// which events are allowed, so a second click or key press can never start a second animation.
//
//   idle → picking_up → floating → rotating → opening → reading
//                 └──────────── closing ◄──────────────┘
//
// `closing` plays the same timeline backwards, from wherever it currently is, back to `idle`.

export type BookState =
  | "idle"
  | "picking_up"
  | "floating"
  | "rotating"
  | "opening"
  | "reading"
  | "closing";

export type FlightPhase = "picking_up" | "floating" | "rotating" | "opening";

export interface Machine {
  state: BookState;
  // The cover cannot open before the PDF is ready, so the book waits after it has rotated.
  isReady: boolean;
  // True when closing was caused by a failure rather than by the user.
  hasFailed: boolean;
}

export type MachineEvent =
  | { type: "CLICK" }
  | { type: "PHASE"; phase: FlightPhase }
  | { type: "READY" }
  | { type: "ARRIVED" }
  | { type: "CLOSE" }
  | { type: "FAIL" }
  | { type: "CLOSED" };

export const initialMachine: Machine = { state: "idle", isReady: false, hasFailed: false };

const FORWARD: readonly FlightPhase[] = ["picking_up", "floating", "rotating", "opening"];

export function isInFlight(state: BookState): state is FlightPhase {
  return (FORWARD as readonly string[]).includes(state);
}

export function reduce(machine: Machine, event: MachineEvent): Machine {
  const { state } = machine;
  switch (event.type) {
    case "CLICK":
      return state === "idle" ? { state: "picking_up", isReady: false, hasFailed: false } : machine;

    case "PHASE": {
      // Phases only move forward, and only while the book is on its way to the reader.
      if (!isInFlight(state)) return machine;
      return FORWARD.indexOf(event.phase) > FORWARD.indexOf(state) ? { ...machine, state: event.phase } : machine;
    }

    case "READY":
      return machine.isReady ? machine : { ...machine, isReady: true };

    case "ARRIVED":
      return state === "opening" ? { ...machine, state: "reading" } : machine;

    case "CLOSE":
      return isInFlight(state) || state === "reading" ? { ...machine, state: "closing" } : machine;

    case "FAIL":
      return isInFlight(state) ? { ...machine, state: "closing", hasFailed: true } : machine;

    case "CLOSED":
      return state === "closing" ? { ...machine, state: "idle" } : machine;
  }
}

// What the user may do right now.
export const canClose = (machine: Machine) => isInFlight(machine.state) || machine.state === "reading";
export const canNavigate = (machine: Machine) => machine.state === "reading";
