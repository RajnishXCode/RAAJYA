/** Gameplay + storage constants for RAAJYA. */

/** Emerald Blocks required (from STATION STORAGE) per recruited soldier. */
export const EMERALD_COST = 5;

/** Number of Diamond Blocks consumed by the spawner crafting recipe. */
export const DIAMOND_RECIPE_COST = 9;

/** Interaction debounce, in server ticks (20 ticks = 1 second). */
export const COOLDOWN_TICKS = 20;

/** Soldier spawn radius around the station (blocks) — configurable, default 4. */
export const DEFAULT_SPAWN_RADIUS = 4;
export const MIN_SPAWN_RADIUS = 1;
export const MAX_SPAWN_RADIUS = 16;

/**
 * Dynamic-property keys (namespaced to avoid collisions; block keys are
 * additionally scoped per content pack by the engine).
 *
 * The Commander ID is stored on BOTH the Commander Stone ItemStack and the
 * Royal Guard Entity under the same key: the stone is the single source of
 * ownership truth.
 */
export const PROP_COMMANDER_ID = "raajya:commander_id";
export const PROP_OWNERSHIP_SCHEMA = "raajya:ownership_schema";
export const OWNERSHIP_SCHEMA_VERSION = 1;
export const PROP_GUARD_MODE = "raajya:guard_mode";
export const PROP_GUARD_OWNER_ID = "raajya:guard_owner_id";
export const PROP_STATION_RECRUITED = "raajya:total_recruited";
export const PROP_WORLD_SPAWN_RADIUS = "raajya:spawn_radius";

/** Tag applied to recruited Royal Guards. */
export const TAG_ROYAL_GUARD = "raajya:royal_guard";

/** Prefix for all player-facing chat messages (Bedrock formatting codes). */
export const MESSAGE_PREFIX = "§6§l[RAAJYA]§r ";

/** `/scriptevent` identifier for the soldier command system. */
export const COMMAND_EVENT_ID = "raajya:cs";

/** Interval (ticks) for the guard-mode monitor (here-mode proximity, safety). */
export const GUARD_MONITOR_INTERVAL_TICKS = 10;

/** Guards in "here" mode switch to "stop" once within this distance of the commander. */
export const HERE_ARRIVE_DISTANCE = 3.5;
