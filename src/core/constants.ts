/** Gameplay + storage constants for RAAJYA. */

/** Number of Emerald Blocks consumed per successful recruitment. */
export const EMERALD_COST = 5;

/** Number of Diamond Blocks consumed by the spawner crafting recipe. */
export const DIAMOND_RECIPE_COST = 9;

/** Interaction debounce, in server ticks (20 ticks = 1 second). */
export const COOLDOWN_TICKS = 20;

/**
 * Dynamic-property keys. Namespaced to avoid collisions with other add-ons.
 *
 * The Commander ID is stored on BOTH the Commander Stone ItemStack and the
 * Royal Guard Entity under the same key: the stone is the single source of
 * ownership truth.
 */
export const PROP_COMMANDER_ID = "raajya:commander_id";
export const PROP_OWNERSHIP_SCHEMA = "raajya:ownership_schema";
export const OWNERSHIP_SCHEMA_VERSION = 1;

/** Tag applied to recruited Royal Guards ( groundwork for later command/AI phases ). */
export const TAG_ROYAL_GUARD = "raajya:royal_guard";

/** Radius (in blocks) around the spawner searched for a safe spawn position. */
export const SPAWN_SEARCH_RADIUS = 3;

/** Prefix for all player-facing chat messages (Bedrock formatting codes). */
export const MESSAGE_PREFIX = "§6§l[RAAJYA]§r ";

/**
 * V2 custom block component bound to the spawner in its block JSON.
 * Registered via `system.beforeEvents.startup`. Must be namespaced.
 */
export const SPAWNER_COMPONENT_ID = "raajya:spawner_interact";
