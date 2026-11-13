/** The loot weapons (spec Loop-iii section 1): original names and numbers. Id 0 is an empty slot; the Pulse Laser and the Torpedo Tube are not in this table. */
export const LootWeapon = { None: 0, Burst: 1, Heavy: 2, Ion: 3, Missile: 4 } as const;
/** laser: the beam's tuning rules, damage per shot; ion: strips a layer or disables a system, no damage; missile: spends a torpedo, ignores shields. */
export type WeaponKind = 'laser' | 'ion' | 'missile';
export interface WeaponDef { readonly name: string; readonly short: string; readonly chargeTime: number; readonly shots: number; readonly damage: number; readonly kind: WeaponKind; readonly price: number }
/** chargeTime: seconds at output 1; price: scrap at a shop (a sale pays half). */
export const WEAPON_DEFS: readonly WeaponDef[] = [
  { name: 'Empty', short: '-', chargeTime: 1, shots: 0, damage: 0, kind: 'laser', price: 0 },
  { name: 'Burst Laser', short: 'Burst', chargeTime: 9, shots: 2, damage: 10, kind: 'laser', price: 60 },
  { name: 'Heavy Laser', short: 'Heavy', chargeTime: 12, shots: 1, damage: 30, kind: 'laser', price: 70 },
  { name: 'Ion Cannon', short: 'Ion', chargeTime: 7, shots: 1, damage: 0, kind: 'ion', price: 55 },
  { name: 'Missile Pod', short: 'Missile', chargeTime: 8, shots: 1, damage: 25, kind: 'missile', price: 65 },
];
/** The number of loot weapon types (ids 1..LOOT_WEAPON_TYPES). */
export const LOOT_WEAPON_TYPES = WEAPON_DEFS.length - 1;
export const weaponDef = (id: number): WeaponDef => WEAPON_DEFS[id]!;
