// Spike ii: the moving rocks' turn in stepDuel. This is spike i's fragment step carried over onto the new dust and hit
// calls (spec §3.5, §3.4); Task 3 of the plan replaces it with §3.2's motion and §3.3's rock-rock contacts.
import { gravityAccel } from './physics';
import { dustRock, hitRock } from './rockBreak';
import { rockAt, RockKind, rocksNear, ROCK_STRIDE } from './rocks';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

const FRAGMENT_ROCK_DAMAGE = 1;
function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

export function stepRocks(s: TacticalState): void {
  const v = s.rocks, movers: number[] = [];
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) if (v[k * ROCK_STRIDE] === RockKind.Moving) movers.push(k);
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    v[b + 3]! += gx * DT; v[b + 4]! += gy * DT;
    v[b + 1]! += v[b + 3]! * DT; v[b + 2]! += v[b + 4]! * DT;
  }
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, p = s.map.planet, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) { dustRock(s, k, planet ? 'planet' : 'edge'); continue; }
    for (const j of rocksNear(s, x, y, r)) {
      if (j === k) continue;
      const o = rockAt(s, j);
      if (!touching(x, y, r, o.x, o.y, o.r)) continue;
      const vx = v[b + 3]!, vy = v[b + 4]!;
      dustRock(s, k, 'collision');
      hitRock(s, j, FRAGMENT_ROCK_DAMAGE, vx - o.vx, vy - o.vy, 'collision');
      break;
    }
  }
}
