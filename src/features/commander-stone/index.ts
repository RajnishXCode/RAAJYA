/**
 * Commander Stone feature.
 *
 * The Commander Stone is the single source of ownership truth in RAAJYA.
 * Its unique Commander ID is stored persistently on the ItemStack itself
 * using `ItemStack.setDynamicProperty`, which is stable in
 * `@minecraft/server` 2.11.0 but works ONLY on non-stackable items. The item
 * definition therefore sets a maximum stack size of 1 (see
 * `behavior_pack/items/commander_stone.json`).
 *
 * Because the ID lives on the ItemStack, it survives being moved between
 * inventory slots, being dropped/picked up, and world save/reload.
 */

import type { Container, ItemStack } from "@minecraft/server";
import { ITEMS } from "../../core/ids";
import { PROP_COMMANDER_ID } from "../../core/constants";
import type { CommanderResolution } from "../../core/types";
import {
  generateCommanderId,
  isValidCommanderId,
  resolveCommanderStone,
} from "../../utils/recruitment-logic.mjs";

/** Default production ID generator (random 32-bit hex suffix). */
export function makeCommanderId(): string {
  return generateCommanderId();
}

/**
 * Read the Commander ID from an ItemStack. A value with an unexpected shape
 * (e.g. from an older/incompatible version) is treated as "not set".
 */
export function readCommanderId(stack: ItemStack): string | undefined {
  const value = stack.getDynamicProperty(PROP_COMMANDER_ID);
  return typeof value === "string" && isValidCommanderId(value) ? value : undefined;
}

/**
 * Scan the whole inventory, decide which Commander ID authorises a
 * recruitment, and persist a newly generated ID on the ACTUAL inventory
 * ItemStack when a stone has none yet.
 *
 * The returned `CommanderResolution`:
 *   - `ok`         -> a single, unambiguous Commander ID (possibly just created)
 *   - `none`       -> no Commander Stone present
 *   - `multiple`   -> several stones, unsafe to guess
 *   - `conflict`   -> several stones with different IDs
 *   - `unsupported`-> the stone is stackable, so dynamic properties cannot be
 *                     stored on it (a pack misconfiguration)
 */
export function acquireCommanderId(
  container: Container,
  generateId: () => string = makeCommanderId,
): CommanderResolution {
  /** @type {Array<{ slot: number, commanderId?: string }>} */
  const stones = [];
  /** @type {Map<number, ItemStack>} */
  const stacksBySlot = new Map<number, ItemStack>();

  for (let slot = 0; slot < container.size; slot++) {
    const stack = container.getItem(slot);
    if (stack && stack.typeId === ITEMS.COMMANDER_STONE) {
      stacksBySlot.set(slot, stack);
      stones.push({ slot, commanderId: readCommanderId(stack) });
    }
  }

  const resolution = resolveCommanderStone(stones, generateId) as CommanderResolution;

  if (resolution.status === "ok" && resolution.initSlots.length > 0) {
    for (const { slot, id } of resolution.initSlots) {
      const stack = stacksBySlot.get(slot);
      if (!stack) {
        return { status: "unsupported" };
      }
      // `setDynamicProperty` only works on non-stackable items. Guard so a
      // misconfigured pack fails loudly and clearly instead of throwing.
      if (stack.isStackable) {
        return { status: "unsupported" };
      }
      try {
        stack.setDynamicProperty(PROP_COMMANDER_ID, id);
        // Make the ID visible in the tooltip for debugging/manual testing.
        stack.setLore([`§7Commander ID: §e${id}`]);
        // REQUIRED: getItem() returns a snapshot. Write it back so the ID
        // persists on the real inventory slot.
        container.setItem(slot, stack);
      } catch {
        return { status: "unsupported" };
      }
    }
  }

  return resolution;
}
