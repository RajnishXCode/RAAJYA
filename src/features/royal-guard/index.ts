/**
 * Royal Guard feature: equipment, ownership persistence and behavioural modes.
 *
 * - Equipment is created and applied from SCRIPT (`EntityEquippableComponent`
 *   + `ItemEnchantableComponent`), so it lands in the real entity equipment
 *   slots and is visibly rendered (the client entity has `enable_attachables`).
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
 * Apply the full enchanted loadout to a guard's real equipment slots.
 * Throws on failure so the recruitment transaction can roll the entity back.
 */
export function applyGuardEquipment(guard: Entity): void {
  const equippable = guard.getComponent("minecraft:equippable") as
    | import("@minecraft/server").EntityEquippableComponent
    | undefined;
  if (!equippable) {
    throw new Error("Royal Guard has no equippable component");
  }
  for (const spec of GUARD_EQUIPMENT) {
    const stack = new ItemStack(spec.typeId, 1);
    if (spec.enchantments) {
      enchantStack(stack, spec.enchantments);
    }
    const ok = equippable.setEquipment(spec.slot, stack);
    if (!ok) {
      throw new Error(`Failed to set equipment slot ${spec.slot}`);
    }
  }
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
