/**
 * Inventory translation layer for the soldier spawner.
 *
 * Converts the live Script API `Container` into plain snapshots that the pure
 * `recruitment-logic.mjs` helpers can reason about, then applies an exact
 * consumption plan back to the real inventory with write-back and rollback.
 */

import { EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import type { Container, ItemStack, Player } from "@minecraft/server";
import { VANILLA } from "../../core/ids";
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

/** A plain, detached snapshot of every inventory slot (index-aligned). */
function snapshotSlots(container: Container): Array<SlotSnapshot | undefined> {
  const slots: Array<SlotSnapshot | undefined> = [];
  for (let slot = 0; slot < container.size; slot++) {
    const stack = container.getItem(slot);
    slots.push(stack ? { typeId: stack.typeId, amount: stack.amount } : undefined);
  }
  return slots;
}

/** Count Emerald Blocks across all stacks in the player's whole inventory. */
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
 * Apply a consumption plan to the real inventory.
 *
 * Each affected slot is re-read and verified before mutation. Original
 * ItemStacks are cloned first so `rollback()` can fully restore the inventory
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
  /** @type {Array<{ slot: number, original: ItemStack }>} */
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
