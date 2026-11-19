/**
 * Royal Guard feature: equipment, ownership persistence and behavioural modes.
 *
 * - Base gear is DATA-DRIVEN: the entity declares `minecraft:equipment` (the
 *   same stable mechanism vanilla zombies use) so every guard spawns holding
 *   the netherite sword, with the diamond armor set applied where the engine
 *   supports it — rendered via the client entity's `enable_attachables`.
 * - Script equipment (`EntityEquippableComponent` + `ItemEnchantableComponent`)
 *   is a BEST-EFFORT upgrade to the exact enchanted loadout, applied only
 *   where the engine exposes equipment slots on custom entities (not on
 *   1.26.60) — it can never fail a recruitment.
 * - Ownership is stored as an entity dynamic property (survives world reloads)
 *   AND the guard is tamed to the recruiting player, which powers the vanilla
 *   `minecraft:behavior.follow_owner` pathfinding used by follow/defend/here —
 *   real navigation, never teleportation.
 * - Modes map 1:1 to `raajya:mode_*` entity events which add/remove component
 *   groups (follow_owner / owner_hurt_* / nearest_attackable_target /
 *   random_stroll) defined in the entity JSON.
 */

import {
  EnchantmentTypes,
  EquipmentSlot,
  ItemStack,
  world,
  type Dimension,
  type Entity,
  type Player,
} from "@minecraft/server";
import { ENTITIES, VANILLA } from "../../core/ids";
import {
  OWNERSHIP_SCHEMA_VERSION,
  PROP_COMMANDER_ID,
  PROP_GUARD_MODE,
  PROP_GUARD_OWNER_ID,
  PROP_OWNERSHIP_SCHEMA,
  TAG_ROYAL_GUARD,
} from "../../core/constants";
import type { GuardMode } from "../../core/types";
import { isGuardMode, isValidCommanderId } from "../../utils/recruitment-logic.mjs";

interface EnchantSpec {
  id: string;
  level: number;
}

interface EquipmentSpec {
  slot: EquipmentSlot;
  typeId: string;
  enchantments?: EnchantSpec[];
}

/** The full royal loadout every recruited guard receives. */
export const GUARD_EQUIPMENT: EquipmentSpec[] = [
  {
    slot: EquipmentSlot.Mainhand,
    typeId: VANILLA.NETHERITE_SWORD,
    enchantments: [
      { id: "minecraft:sharpness", level: 3 },
      { id: "minecraft:unbreaking", level: 3 },
    ],
  },
  { slot: EquipmentSlot.Offhand, typeId: VANILLA.SHIELD },
  {
    slot: EquipmentSlot.Head,
    typeId: VANILLA.DIAMOND_HELMET,
    enchantments: [
      { id: "minecraft:protection", level: 3 },
      { id: "minecraft:unbreaking", level: 3 },
    ],
  },
  {
    slot: EquipmentSlot.Chest,
    typeId: VANILLA.DIAMOND_CHESTPLATE,
    enchantments: [
      { id: "minecraft:protection", level: 3 },
      { id: "minecraft:unbreaking", level: 3 },
    ],
  },
  {
    slot: EquipmentSlot.Legs,
    typeId: VANILLA.DIAMOND_LEGGINGS,
    enchantments: [
      { id: "minecraft:protection", level: 3 },
      { id: "minecraft:unbreaking", level: 3 },
    ],
  },
  {
    slot: EquipmentSlot.Feet,
    typeId: VANILLA.DIAMOND_BOOTS,
    enchantments: [
      { id: "minecraft:protection", level: 3 },
      { id: "minecraft:unbreaking", level: 3 },
    ],
  },
];

function enchantStack(stack: ItemStack, enchantments: EnchantSpec[]): void {
  const enchantable = stack.getComponent("minecraft:enchantable") as
    | import("@minecraft/server").ItemEnchantableComponent
    | undefined;
  if (!enchantable) {
    throw new Error(`Item ${stack.typeId} is not enchantable`);
  }
  enchantable.addEnchantments(
    enchantments.map(({ id, level }) => {
      const type = EnchantmentTypes.get(id);
      if (!type) {
        throw new Error(`Unknown enchantment: ${id}`);
      }
      return { type, level };
    }),
  );
}

/**
 * Best-effort enchanted loadout via the script `EntityEquippableComponent`.
 *
 * On Minecraft 1.26.60, custom entities do NOT expose script equipment slots
 * (the component exists on player entities and hardcoded mobs only — the
 * "Royal Guard has no equippable component" failure). The base gear is
 * therefore data-driven: the entity's `minecraft:equipment` component gives
 * every guard the netherite sword and (engine-permitting) the diamond armor
 * set at spawn, exactly like vanilla zombie gear. This script pass upgrades
 * to the exact enchanted loadout wherever the engine DOES expose slots, and
 * degrades gracefully (returns false, never throws for a missing component)
 * so recruitment can never fail because of equipment.
 *
 * @returns true when the full enchanted loadout was applied.
 */
export function applyGuardEquipment(guard: Entity): boolean {
  const equippable = guard.getComponent("minecraft:equippable") as
    | import("@minecraft/server").EntityEquippableComponent
    | undefined;
  if (!equippable) {
    // Data-driven gear from minecraft:equipment remains; nothing to roll back.
    return false;
  }
  for (const spec of GUARD_EQUIPMENT) {
    const stack = new ItemStack(spec.typeId, 1);
    if (spec.enchantments) {
      try {
        enchantStack(stack, spec.enchantments);
      } catch {
        return false; // Cosmetic only — never block recruitment on enchants.
      }
    }
    try {
      const ok = equippable.setEquipment(spec.slot, stack);
      if (!ok) {
        return false; // Partial application is cosmetic and harmless.
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Persist ownership on the guard: the Commander Stone's ID (the ONLY source of
 * ownership), the recruiting player's id, a schema version, and a tag — plus
 * tame the guard to the player so `follow_owner` pathfinding works.
 */
export function assignOwnership(guard: Entity, commanderId: string, player: Player): void {
  if (!isValidCommanderId(commanderId)) {
    throw new Error(`Refusing to assign an invalid Commander ID: ${String(commanderId)}`);
  }
  guard.setDynamicProperty(PROP_COMMANDER_ID, commanderId);
  guard.setDynamicProperty(PROP_OWNERSHIP_SCHEMA, OWNERSHIP_SCHEMA_VERSION);
  guard.setDynamicProperty(PROP_GUARD_OWNER_ID, player.id);
  guard.addTag(TAG_ROYAL_GUARD);

  // Taming enables vanilla follow_owner / owner_hurt_* behaviors. Probability
  // is 0 in the entity JSON so players can never tame a guard with items.
  const tameable = guard.getComponent("minecraft:tameable") as
    | import("@minecraft/server").EntityTameableComponent
    | undefined;
  if (tameable) {
    try {
      tameable.tame(player);
    } catch {
      // Non-fatal: guards still work, follow-mode just needs the owner id path.
    }
  }
}

/** Read a guard's Commander ID back (used for command authorisation). */
export function readOwnership(guard: Entity): string | undefined {
  const value = guard.getDynamicProperty(PROP_COMMANDER_ID);
  return typeof value === "string" && isValidCommanderId(value) ? value : undefined;
}

/** The player this guard was recruited by (tamed owner, else stored owner id). */
export function getGuardOwner(guard: Entity): Player | undefined {
  const tameable = guard.getComponent("minecraft:tameable") as
    | import("@minecraft/server").EntityTameableComponent
    | undefined;
  if (tameable) {
    try {
      const owner = tameable.tamedToPlayer;
      if (owner && owner.isValid) {
        return owner;
      }
    } catch {
      // fall through to the stored owner id
    }
  }
  const ownerId = guard.getDynamicProperty(PROP_GUARD_OWNER_ID);
  if (typeof ownerId !== "string") {
    return undefined;
  }
  return world.getAllPlayers().find((p) => p.id === ownerId);
}

/** Switch a guard's behavioural mode (entity event + persisted property). */
export function setGuardMode(guard: Entity, mode: GuardMode): void {
  guard.triggerEvent(`raajya:mode_${mode}`);
  guard.setDynamicProperty(PROP_GUARD_MODE, mode);
}

/** Read a guard's mode; unrecognised/missing values read as "stop". */
export function getGuardMode(guard: Entity): GuardMode {
  const value = guard.getDynamicProperty(PROP_GUARD_MODE);
  return isGuardMode(value) ? (value as GuardMode) : "stop";
}

/** Re-apply a persisted mode after the entity (re)loads — keeps groups in sync. */
export function reapplyGuardMode(guard: Entity): void {
  if (guard.typeId !== ENTITIES.ROYAL_GUARD || !guard.isValid) {
    return;
  }
  const value = guard.getDynamicProperty(PROP_GUARD_MODE);
  if (isGuardMode(value)) {
    guard.triggerEvent(`raajya:mode_${value}`);
  }
}

/** All recruited guards in `dimension` owned by the given Commander ID. */
export function findOwnedGuards(dimension: Dimension, commanderId: string): Entity[] {
  const candidates = dimension.getEntities({ type: ENTITIES.ROYAL_GUARD });
  return candidates.filter((guard) => guard.isValid && readOwnership(guard) === commanderId);
}
