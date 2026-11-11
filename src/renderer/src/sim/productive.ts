import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { warnedTargets, isEnemySlot, ENEMY_SLOT } from './debrisTargets';
import { isOverdriven } from './heat';
import { bonusBars, powerUsed } from './power';
import { PRODUCTIVE_WINDOW_TICKS, HAZARD_EVERY, HEALTH_MAX, DEBRIS_SLOTS } from './tuning';

/** A stamp is recent while it is set and fewer than span ticks old. An unset stamp (-1) is never recent. */
export function recent(stamp: number, tick: number, span: number): boolean {
  return stamp >= 0 && tick - stamp >= 0 && tick - stamp < span;
}

function anyWarned(state: SimState): boolean { return warnedTargets(state).some((k) => k < DEBRIS_SLOTS); }   // objects only: the enemy's presence alone is not incoming work (spec Combat-ii section 3)

/**
 * Productive predicate per station index (foundation section 5, spec 3-i section 6). The caller checks that the station
 * is online with a seated Conscious operator; this only asks whether the station is doing useful work right now.
 */
export function isProductive(state: SimState, i: number): boolean {
  const kind = state.derived.stationKind[i]!, sk = state.skills, tick = state.tick;
  switch (kind) {
    case StationKind.Navigation: return anyWarned(state);
    case StationKind.Weapons: return recent(sk.lastShotTick, tick, PRODUCTIVE_WINDOW_TICKS);
    case StationKind.Science: {
      const c = state.stations.cursor[i]!, db = state.debris, e = state.enemy;
      const scanningValid = state.science.scanning === 1 && c >= 0 && (c === ENEMY_SLOT ? e.present === 1 && e.scanned === 0 : !isEnemySlot(c) && db.active[c] === 1 && db.warned[c] === 1 && db.scanned[c] === 0);
      return scanningValid || anyWarned(state);
    }
    case StationKind.Engineering: {
      for (let j = 0; j < state.stations.level.length; j++) if (isOverdriven(state, j)) return true;
      if (bonusBars(state) > 0 && powerUsed(state) > state.power.capacity) return true;
      return recent(sk.lastEngChangeTick, tick, PRODUCTIVE_WINDOW_TICKS);
    }
    case StationKind.LifeSupport: return recent(sk.lsDeliveredTick, tick, HAZARD_EVERY + 1);
    case StationKind.Medbay: {
      const r = state.derived.stationRoom[i]!;
      for (let pid = 0; pid < state.playerCount; pid++) {
        const eid = state.crew[pid]!;
        if (Life.state[eid] === LifeState.Conscious && Health.cur[eid]! < HEALTH_MAX && roomAt(state, Position.x[eid]!, Position.y[eid]!) === r) return true;
      }
      return false;
    }
    case StationKind.Doors: {
      for (const f of state.rooms.fire) if (f > 0) return true;
      for (const b of state.breaches.active) if (b) return true;
      return recent(sk.lastDoorToggleTick, tick, PRODUCTIVE_WINDOW_TICKS);
    }
    default: return false;
  }
}
