/**
 * Recruitment orchestration: the core gameplay transaction.
 *
 * Ordering follows the project spec and is designed so that on ANY failure
 * no Emerald Blocks are consumed and no soldier is left behind:
 *
 *   Phase A (read-only): inventory access, Commander ID resolution,
 *     emerald availability, safe spawn position.
 *   Phase B (mutating, atomic via rollback): spawn one guard -> assign
 *     ownership from the Commander Stone -> consume exactly EMERALD_COST
 *     Emerald Blocks. Any exception restores the inventory and removes the
 *     spawned entity before returning a clean failure.
 *
 * The Commander Stone and the spawner block are NEVER consumed.
 */

import type { Block, Entity, Player } from "@minecraft/server";
import { ENTITIES, VANILLA } from "../../core/ids";
import { EMERALD_COST, PROP_COMMANDER_ID } from "../../core/constants";
import type { CommanderResolution, RecruitmentResult } from "../../core/types";
import { makeCommanderId, acquireCommanderId } from "../commander-stone";
import { assignOwnership } from "../royal-guard";
import {
  getInventoryContainer,
  countEmeraldBlocks,
  planEmeraldConsumption,
  applyConsumptionPlan,
  type ConsumptionResult,
} from "./inventory";
import { findSafeSpawnLocation } from "./spawn";
import { logError } from "../../utils/log";

const NOOP_ROLLBACK: ConsumptionResult = { ok: false, rollback: () => {} };

/** Map a non-ok CommanderResolution to a RecruitmentFailure reason. */
function commanderFailureReason(status: Exclude<CommanderResolution["status"], "ok">):
  | "no_commander_stone"
  | "multiple_commander_stones"
  | "conflicting_commander_stones"
  | "commander_id_unsupported" {
  switch (status) {
    case "none":
      return "no_commander_stone";
    case "multiple":
      return "multiple_commander_stones";
    case "conflict":
      return "conflicting_commander_stones";
    case "unsupported":
      return "commander_id_unsupported";
    default:
      return "no_commander_stone";
  }
}

/**
 * Attempt to recruit exactly one Royal Guard for `player` using `spawner`.
 * Returns a structured result; it does NOT send chat messages (that is the
 * job of `index.ts`) so the transaction itself stays easy to reason about.
 */
export function recruit(
  player: Player,
  spawner: Block,
  generateId: () => string = makeCommanderId,
): RecruitmentResult {
  // ---- Phase A: read-only validations ----------------------------------
  const container = getInventoryContainer(player);
  if (!container) {
    return { ok: false, reason: "no_inventory" };
  }

  const commander = acquireCommanderId(container, generateId);
  if (commander.status !== "ok") {
    return { ok: false, reason: commanderFailureReason(commander.status) };
  }
  const commanderId = commander.commanderId;

  if (countEmeraldBlocks(container) < EMERALD_COST) {
    return { ok: false, reason: "insufficient_emeralds" };
  }
  const plan = planEmeraldConsumption(container, EMERALD_COST);
  if (!plan) {
    return { ok: false, reason: "insufficient_emeralds" };
  }

  const spawnLocation = findSafeSpawnLocation(spawner);
  if (!spawnLocation) {
    return { ok: false, reason: "no_safe_spawn" };
  }

  // ---- Phase B: mutating, with full rollback on error ------------------
  let spawned: Entity | undefined;
  let consumption: ConsumptionResult = NOOP_ROLLBACK;

  try {
    spawned = spawner.dimension.spawnEntity(ENTITIES.ROYAL_GUARD, spawnLocation);
    if (!spawned || !spawned.isValid) {
      throw new Error("spawnEntity returned an invalid entity");
    }

    // Ownership comes ONLY from the Commander Stone (never the player/block).
    assignOwnership(spawned, commanderId);

    // Sanity: the ID must have persisted on the entity before we commit.
    if (spawned.getDynamicProperty(PROP_COMMANDER_ID) !== commanderId) {
      throw new Error("failed to persist Commander ID on the Royal Guard");
    }

    // Consume exactly EMERALD_COST Emerald Blocks (spread across stacks).
    consumption = applyConsumptionPlan(container, plan, VANILLA.EMERALD_BLOCK);
    if (!consumption.ok) {
      throw new Error("failed to consume Emerald Blocks");
    }

    return { ok: true, commanderId };
  } catch (error) {
    // Roll back in reverse order: restore inventory, then remove the soldier.
    consumption.rollback();
    if (spawned && spawned.isValid) {
      try {
        spawned.remove();
      } catch {
        // Best-effort cleanup; the failure is reported below.
      }
    }
    logError("Recruitment failed and was rolled back (nothing consumed)", error);
    return { ok: false, reason: "recruitment_error" };
  }
}
