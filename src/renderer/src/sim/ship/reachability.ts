/** 4-neighbour BFS over tiles where `passable` is true, starting at `from`. Returns tile indices (ty*width+tx). */
export function reachableTiles(
  width: number, height: number, from: [number, number], passable: (tx: number, ty: number) => boolean
): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  const push = (tx: number, ty: number): void => {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return;
    const i = ty * width + tx;
    if (seen.has(i) || !passable(tx, ty)) return;
    seen.add(i); queue.push(i);
  };
  push(from[0], from[1]);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, tx = i % width, ty = (i - tx) / width;
    push(tx + 1, ty); push(tx - 1, ty); push(tx, ty + 1); push(tx, ty - 1);
  }
  return seen;
}
