// Moves the entry at `index` by `delta`; the order is unchanged if that would leave the list.
export function moveId(ids: readonly number[], index: number, delta: -1 | 1): number[] {
  const target = index + delta;
  const next = [...ids];
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
