/**
 * Centralised custom and vanilla identifiers.
 *
 * These values MUST stay in sync with the JSON definitions in `behavior_pack/`
 * and `resource_pack/`. `scripts/validate.mjs` cross-checks them automatically.
 */

/** Custom item identifiers (Behavior Pack `items/` + RP `item_texture.json`). */
export const ITEMS = {
  COMMANDER_STONE: "raajya:commander_stone",
} as const;

/** Custom block identifiers (Behavior Pack `blocks/` + RP `blocks.json`). */
export const BLOCKS = {
  ROYAL_SOLDIER_SPAWNER: "raajya:royal_soldier_spawner",
} as const;

/** Custom entity identifiers (Behavior Pack `entities/` + RP `entity/`). */
export const ENTITIES = {
  ROYAL_GUARD: "raajya:royal_guard",
} as const;

/** Vanilla identifiers used by the recruitment economy and crafting recipe. */
export const VANILLA = {
  EMERALD_BLOCK: "minecraft:emerald_block",
  DIAMOND_BLOCK: "minecraft:diamond_block",
} as const;
