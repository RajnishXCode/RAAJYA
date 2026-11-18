/**
 * Inventory helpers shared by the station (block container) and players.
 *
 * Converts live Script API `Container`s into plain snapshots that the pure
 * `recruitment-logic.mjs` helpers reason about, then applies exact consumption
 * plans back with write-back and rollback. Works for ANY container (player
 * inventory or the station's block-entity container).
 */

import { EntityComponentTypes, ItemStack, type EntityInventoryComponent } from "@minecraft/server";
import type { Container, Player } from "@minecraft/server";
import { ITEMS, VANILLA } from "../../core/ids";
import type { ConsumeStep } from "../../core/types";
import { countItem, planConsume } from "../../utils/recruitment-logic.mjs";

interface SlotSnapshot {
  typeId: string;
  amount: number;
}

export interface ConsumptionResult {
  ok: boolean;
  /** Restore every affected slot to its exact pre-consumption state. */
  rollback: () => void;
}

/** Access a player's 36-slot inventory container, or undefined if unavailable. */
export function getInventoryContainer(player: Player): Container | undefined {
  const component = player.getComponent(EntityComponentTypes.Inventory) as
    | EntityInventoryComponent
    | undefined;
  if (!component || !component.container || !component.container.isValid) {
    return undefined;
  }
  return component.container;
}

/** A plain, detached snapshot of every container slot (index-aligned). */
export function snapshotSlots(container: Container): Array<SlotSnapshot | undefined> {
  const slots: Array<SlotSnapshot | undefined> = [];
  for (let slot = 0; slot < container.size; slot++) {
    const stack = container.getItem(slot);
    slots.push(stack ? { typeId: stack.typeId, amount: stack.amount } : undefined);
  }
  return slots;
}

/** Count Emerald Blocks across all stacks of any container. */
export function countEmeraldBlocks(container: Container): number {
  return countItem(snapshotSlots(container), VANILLA.EMERALD_BLOCK);
}

/** Compute an exact plan to consume `amount` Emerald Blocks, or null if short. */
export function planEmeraldConsumption(
  container: Container,
  amount: number,
): ConsumeStep[] | null {
  return planConsume(snapshotSlots(container), VANILLA.EMERALD_BLOCK, amount) as
    | ConsumeStep[]
    | null;
}

/**
 * Apply a consumption plan to a real container.
 *
 * Each affected slot is re-read and verified before mutation. Original
 * ItemStacks are cloned first so `rollback()` can fully restore the container
 * if any later step fails (used by the recruitment transaction).
 *
 * `container.setItem(slot, ...)` is the REQUIRED write-back: `getItem()`
 * returns a snapshot, so mutating it alone would not persist.
 */
export function applyConsumptionPlan(
  container: Container,
  plan: ConsumeStep[],
  typeId: string,
): ConsumptionResult {
  const originals: Array<{ slot: number; original: ItemStack }> = [];

  const rollback = (): void => {
    for (const { slot, original } of originals) {
      try {
        container.setItem(slot, original);
      } catch {
        // Best-effort restore; errors are surfaced by the caller.
      }
    }
  };

  try {
    for (const step of plan) {
      const stack = container.getItem(step.slot);
      if (!stack || stack.typeId !== typeId) {
        rollback();
        return { ok: false, rollback: () => {} };
      }

      // Preserve an unmodified clone for rollback BEFORE touching the stack.
      originals.push({ slot: step.slot, original: stack.clone() });

      if (step.newAmount <= 0) {
        container.setItem(step.slot, undefined);
      } else {
        stack.amount = step.newAmount;
        container.setItem(step.slot, stack);
      }
    }
    return { ok: true, rollback };
  } catch {
    rollback();
    return { ok: false, rollback: () => {} };
  }
}

/**
 * Return every Commander Stone found in a container to a player's inventory.
 * Guarantees the "never deposited or consumed" invariant if a player manually
 * drops a stone into the station UI. Returns how many were ejected.
 */
export function ejectCommanderStones(container: Container, player: Player): number {
  let ejected = 0;
  const playerContainer = getInventoryContainer(player);
  for (let slot = 0; slot < container.size; slot++) {
    const stack = container.getItem(slot);
    if (!stack || stack.typeId !== ITEMS.COMMANDER_STONE) {
      continue;
    }
    container.setItem(slot, undefined);
    if (playerContainer) {
      const leftover = playerContainer.addItem(stack);
      if (!leftover) {
        ejected++;
        continue;
      }
      // Inventory full: hand back what did not fit.
      playerContainer.addItem(leftover);
    }
    // Absolute fallback: drop at the player's feet rather than lose the stone.
    player.dimension.spawnItem(stack, player.location);
    ejected++;
  }
  return ejected;
}
