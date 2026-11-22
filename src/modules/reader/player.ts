// Moves a time value between 0 and 1 at a steady rate and reports every frame. The easing lives in
// the pose function, so the same player opens (towards 1) and closes (towards 0) the book.

export interface Player {
  readonly time: number;
  // Resolves true when `target` is reached, false if something else took over first.
  playTo: (target: number) => Promise<boolean>;
  jumpTo: (time: number) => void;
  stop: () => void;
}

export function createPlayer(onFrame: (time: number) => void, fullMs: number, instant: boolean): Player {
  let time = 0;
  let frame = 0;
  let cancel: (() => void) | null = null;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    cancel?.();
    cancel = null;
  };

  const jumpTo = (next: number) => {
    stop();
    time = next;
    onFrame(time);
  };

  const playTo = (target: number) => {
    stop();
    if (instant || time === target) {
      jumpTo(target);
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const direction = Math.sign(target - time);
      let last = performance.now();
      cancel = () => resolve(false);

      const step = (now: number) => {
        // A long frame (a busy page, a hidden window) must not make the book jump.
        const elapsed = Math.min(now - last, 50);
        last = now;
        time += (direction * elapsed) / fullMs;

        if ((direction > 0 && time >= target) || (direction < 0 && time <= target)) {
          time = target;
          frame = 0;
          cancel = null;
          onFrame(time);
          resolve(true);
          return;
        }
        onFrame(time);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
  };

  return {
    get time() {
      return time;
    },
    playTo,
    jumpTo,
    stop,
  };
}
