import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { warnedTargets, ENEMY_SLOT, isEnemySlot } from './debrisTargets';
import { DT, SCAN_TIME, LOCK_SECONDS, TICK_HZ, SYSTEM_SCAN_TIME, SCAN_DETECT_BASE, SCAN_DETECT_SKILL, SCAN_DETECT_MAX, CACHE_FUEL, CACHE_FUEL_CHANCE, scrapCache } from './tuning';
import { lockActive } from './enemy';
import { Dir } from './dir';
import { nextFloat } from '../../../shared/rng';
import { skillLevelOf } from './skills';
import { Skill } from './skillIds';
import { reachable, beaconIndex, hereIndex, overrun, contentOf, NodeType } from './run';
import { addScrap } from './scrap';
import { depthOf } from './depth';

/** The system scan's state in science.systemState (spec Demo-x-b section 3): ready at this beacon, running, done for this visit. */
export const SystemScan = { Ready: 0, Running: 1, Done: 2 } as const;
/** The finding bits in science.systemResult; the charted beacon count sits from bit 3. */
export const ScanFound = { Ship: 1, Cache: 2, Fuel: 4 } as const;
/** A finding's chance at a Science skill level: SCAN_DETECT_BASE + SCAN_DETECT_SKILL x level, capped at SCAN_DETECT_MAX. */
export function scanDetectChance(level: number): number { return Math.min(SCAN_DETECT_MAX, Math.round((SCAN_DETECT_BASE + SCAN_DETECT_SKILL * level) * 1e9) / 1e9); }
/** The chance for the officer seated at Science console i (level 0 with nobody seated). */
export function detectChance(state: SimState, i: number): number { const occ = state.stations.occupant[i]!; return scanDetectChance(occ >= 0 ? skillLevelOf(state, occ, Skill.Science) : 0); }

/** Science's Up/Down (spec 2b-ii section 4, Demo-x-b section 3): the warned targets by StableId, then the system row (cursor -1), with wrap. */
function scienceCycle(state: SimState, i: number, dir: number): void {
  if (dir !== Dir.Up && dir !== Dir.Down) return;
  const list = [...warnedTargets(state, false), -1], c = state.stations.cursor, n = list.length;   // the enemy ship as one row (spec Demo-x-c section 4)
  const k = list.indexOf(c[i]! < 0 ? -1 : c[i]!);
  c[i] = list[k < 0 ? 0 : dir === Dir.Up ? (k + n - 1) % n : (k + 1) % n]!;
}

/** Confirm on the system row: the one scan of this beacon visit starts (spec Demo-x-b section 3). False when Science is offline or the scan already ran. */
export function startSystemScan(state: SimState, i: number): boolean {
  const sc = state.science;
  if (!stationOnline(state, i) || sc.systemState !== SystemScan.Ready) return false;
  sc.systemState = SystemScan.Running; sc.systemStartTick = state.tick; return true;
}

/** Once per tick: a running system scan progresses while Science is online and occupied, wherever the cursor is; at 1 it resolves. */
export function systemScanStep(state: SimState): void {
  const sc = state.science;
  if (sc.systemState !== SystemScan.Running) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  sc.system = Math.min(1, sc.system + DT * stationOutput(state, sci) / SYSTEM_SCAN_TIME);
  if (sc.system >= 1 - 1e-9) { sc.system = 1; resolveSystemScan(state, sci); }
}

/** The scan's findings (spec Demo-x-b section 3), each with the seated officer's chance and one rng.loot draw, only for what is there: the hidden ambusher (detected), the cache (collected: a second draw picks fuel or scrap), then each unknown reachable beacon in reachable() order (charted). */
function resolveSystemScan(state: SimState, sci: number): void {
  const r = state.run, sc = state.science, p = detectChance(state, sci), k = hereIndex(state), last = r.colNodes.length - 1;
  let res = 0, charted = 0;
  if (r.ambushState === 1 && !state.enemy.present && nextFloat(state.rng.loot) < p) { r.ambushState = 2; res |= ScanFound.Ship; }
  if (r.cache[k] && contentOf(state) === NodeType.Empty && nextFloat(state.rng.loot) < p) {
    r.cache[k] = 0; res |= ScanFound.Cache;
    if (nextFloat(state.rng.loot) < CACHE_FUEL_CHANCE) { r.fuel += CACHE_FUEL; res |= ScanFound.Fuel; } else addScrap(state, scrapCache(depthOf(state)));
  }
  if (!r.finalBeacon) for (const b of reachable(state)) {
    const j = beaconIndex(b.column, b.node);
    if (r.visited[j] || r.revealed[j] || b.column === last || r.nodeType[j] === NodeType.Shop || overrun(state, b.column)) continue;   // already known: no draw
    if (nextFloat(state.rng.loot) < p) { r.revealed[j] = 1; charted++; }
  }
  sc.systemState = SystemScan.Done; sc.systemTick = state.tick; sc.systemResult = res | (charted << 3);
}

/** A lock is possible (spec Coop-i section 1): Science online with the cursor on the scanned enemy's hull row and no lock running. */
export function canLock(state: SimState, i: number): boolean {
  const e = state.enemy;
  return stationOnline(state, i) && state.stations.cursor[i] === ENEMY_SLOT && e.present === 1 && e.scanned === 1 && !lockActive(state);
}

/** Seated Science input: Up/Down cycle warned targets and the system row; Confirm starts a scan of the selected unscanned object or of the enemy hull row (spec 2b-ii section 4, Combat-ii section 5), or the system scan on its row (spec Demo-x-b section 3). */
export function scienceInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  scienceCycle(state, i, dir);
  if (!confirm) return;
  const c = state.stations.cursor[i]!, db = state.debris, e = state.enemy;
  if (c < 0) { startSystemScan(state, i); return; }   // the system row (spec Demo-x-b section 3)
  if (isEnemySlot(c)) {
    if (c === ENEMY_SLOT && e.present && !e.scanned) state.science.scanning = 1;   // only the hull row scans the ship (spec Combat-ii section 5)
    else if (canLock(state, i)) e.lockUntilTick = state.tick + LOCK_SECONDS * TICK_HZ;   // scanned: Confirm locks the frequency for Weapons (spec Coop-i section 1)
    return;
  }
  if (db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;
}

/** Once per tick: the running scan progresses while Science is online and occupied and its cursor is an unscanned warned object or the unscanned enemy hull row. */
export function scanStep(state: SimState): void {
  if (!state.science.scanning) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  const c = state.stations.cursor[sci]!, db = state.debris, e = state.enemy;
  if (c < 0) return;
  if (isEnemySlot(c)) {
    if (c !== ENEMY_SLOT || !e.present || e.scanned) return;
    e.scan = Math.min(1, e.scan + DT * stationOutput(state, sci) / SCAN_TIME);
    if (e.scan >= 1) { e.scanned = 1; state.science.scanning = 0; }
    return;
  }
  if (!db.active[c] || !db.warned[c] || db.scanned[c]) return;
  db.scan[c] = Math.min(1, db.scan[c]! + DT * stationOutput(state, sci) / SCAN_TIME);
  if (db.scan[c]! >= 1) { db.scanned[c] = 1; state.science.scanning = 0; }
}
