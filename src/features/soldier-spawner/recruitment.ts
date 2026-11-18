/**
 * Recruitment orchestration: the core gameplay transaction.
 *
 * The economy lives IN THE STATION: Emerald Blocks are deposited into the
 * station's container (the real block-entity container UI), and every
 * `EMERALD_COST` stored blocks funds exactly one soldier. The interacting
 * player must hold a valid Commander Stone; the stone is never deposited or
 * consumed.
 *
 * Ordering (per soldier) and failure guarantees:
 *   1. Read-only checks: station container, stored count, Commander ID,
 *      safe spawn position (within the configured radius).
 *   2. Mutating phase, atomic via rollback: spawn one guard -> apply the full
 *      enchanted loadout -> assign ownership + tame -> consume exactly
 *      EMERALD_COST Emerald Blocks FROM THE STATION. Any exception removes the
 *      guard and restores the container — no lost resources, no orphan
 *      soldiers, and the remaining stored blocks stay in the station.
 */

import {
  type Block,
  type Container,
  type Entity,
  type Player,
} from "@minecraft/server";
import { ENTITIES, VANILLA } from "../../core/ids";
import { EMERALD_COST, PROP_COMMANDER_ID } from "../../core/constants";
import type {
  CommanderResolution,
  RecruitmentFailure,
  RecruitmentResult,
} from "../../core/types";
import { makeCommanderId, acquireCommanderId } from "../commander-stone";
import { assignOwnership, applyGuardEquipment } from "../royal-guard";
import {
  countEmeraldBlocks,
  planEmeraldConsumption,
  applyConsumptionPlan,
  type ConsumptionResult,
} from "./inventory";
import { findSafeSpawnLocation } from "./spawn";
import { logError } from "../../utils/log";

const NOOP_ROLLBACK: ConsumptionResult = { ok: false, rollback: () => {} };

/** Map a non-ok CommanderResolution to a RecruitmentFailure reason. */
function commanderFailureReason(status: Exclude<CommanderResolution["status"], "ok">): RecruitmentFailure {
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
 * Recruit up to `count` soldiers for `player` from the station `block`,
 * consuming `EMERALD_COST` stored Emerald Blocks per soldier. Returns the
 * structured result; chat feedback is the caller's job.
 */
export function recruit(
  player: Player,
  block: Block,
  container: Container,
  count: number,
  generateId: () => string = makeCommanderId,
): RecruitmentResult {
  // ---- Phase A: read-only validations ----------------------------------
  const stored = countEmeraldBlocks(container);
  const affordable = Math.min(count, Math.floor(stored / EMERALD_COST));
  if (affordable <= 0) {
    return { ok: false, reason: "insufficient_emeralds" };
  }

  const playerContainer = getInventoryContainer(player);
  if (!playerContainer) {
    return { ok: false, reason: "no_inventory" };
  }
  const commander = acquireCommanderId(playerContainer, generateId);
  if (commander.status !== "ok") {
    return { ok: false, reason: commanderFailureReason(commander.status) };
  }
  const commanderId = commander.commanderId;

  // ---- Phase B: per-soldier transactions --------------------------------
  let recruited = 0;
  for (let i = 0; i < affordable; i++) {
    const plan = planEmeraldConsumption(container, EMERALD_COST);
    if (!plan) {
      break; // Storage changed underneath us; keep what remains stored.
    }
    const spawnLocation = findSafeSpawnLocation(block);
    if (!spawnLocation) {
      // Preserve remaining resources and report how many DID succeed.
      return recruited > 0
        ? { ok: true, commanderId, recruited }
        : { ok: false, reason: "no_safe_spawn" };
    }

    let spawned: Entity | undefined;
    let consumption: ConsumptionResult = NOOP_ROLLBACK;
    try {
      spawned = block.dimension.spawnEntity(ENTITIES.ROYAL_GUARD, spawnLocation);
      if (!spawned || !spawned.isValid) {
        throw new Error("spawnEntity returned an invalid entity");
      }

      // Ownership comes ONLY from the Commander Stone (never player/block).
      assignOwnership(spawned, commanderId, player);

      // Sanity: the ID must have persisted on the entity before we commit.
      if (spawned.getDynamicProperty(PROP_COMMANDER_ID) !== commanderId) {
        throw new Error("failed to persist Commander ID on the Royal Guard");
      }

      // Full enchanted loadout (sword + shield + Protection IV-tier armor).
      applyGuardEquipment(spawned);

      // Consume exactly EMERALD_COST Emerald Blocks from the STATION.
      consumption = applyConsumptionPlan(container, plan, VANILLA.EMERALD_BLOCK);
      if (!consumption.ok) {
        throw new Error("failed to consume Emerald Blocks from the station");
      }

      recruited++;
    } catch (error) {
      consumption.rollback();
      if (spawned && spawned.isValid) {
        try {
          spawned.remove();
        } catch {
          // Best-effort cleanup; the failure is reported below.
        }
      }
      logError("Recruitment failed and was rolled back (nothing consumed)", error);
      return recruited > 0
        ? { ok: true, commanderId, recruited }
        : { ok: false, reason: "recruitment_error" };
    }
  }

  return { ok: true, commanderId, recruited };
}

/** The interacting player's inventory container (validated). */
function getInventoryContainer(player: Player): Container | undefined {
  const component = player.getComponent("minecraft:inventory") as
    | import("@minecraft/server").EntityInventoryComponent
    | undefined;
  if (!component || !component.container || !component.container.isValid) {
    return undefined;
  }
  return component.container;
}
