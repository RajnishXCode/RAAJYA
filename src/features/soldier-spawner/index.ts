/**
 * Event-facing entry point for the Royal Soldier Spawner station.
 *
 * Interacting (use) with the station triggers inventory-based recruitment:
 * every `EMERALD_COST` Emerald Blocks the interacting player CARRIES funds
 * exactly one soldier, consumed directly from the player's inventory by the
 * rollback-safe recruit() transaction. This is the stable, experiment-free
 * path on Minecraft 1.26.60 — custom-block containers (`minecraft:block_entity`
 * → `container`) are still behind the "Upcoming Creator Features" experiment
 * there, so the station block definition deliberately ships without one (see
 * station.ts and the README's honest note).
 *
 * Only the initial button press counts (`isFirstEvent`); holding the use
 * button does not re-trigger. A short per-player cooldown adds a second
 * guard against duplicated events for the same interaction.
 */

import { system, world } from "@minecraft/server";
import type { Block } from "@minecraft/server";
import { BLOCKS } from "../../core/ids";
import { COOLDOWN_TICKS } from "../../core/constants";
import { logError } from "../../utils/log";
import { isPlayer, processStationInteract } from "./station";

/** Player IDs currently within the interact-processing cooldown window. */
const cooldowns = new Set<string>();

function isOnCooldown(playerId: string): boolean {
  return cooldowns.has(playerId);
}

function startCooldown(playerId: string): void {
  cooldowns.add(playerId);
  system.runTimeout(() => cooldowns.delete(playerId), COOLDOWN_TICKS);
}

function isStation(block: Block): boolean {
  return block.typeId === BLOCKS.ROYAL_SOLDIER_SPAWNER;
}

/** Wire the station interaction handler. Called once from main.ts. */
export function registerStationEvents(): void {
  world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    try {
      if (!isStation(event.block)) {
        return;
      }
      // Ignore held-button repeats: only the initial press recruits.
      if (!event.isFirstEvent) {
        return;
      }
      const player = event.player;
      if (!isPlayer(player) || isOnCooldown(player.id)) {
        return;
      }
      startCooldown(player.id);
      processStationInteract(player, event.block);
    } catch (error) {
      logError("Station interact handler error", error);
    }
  });
}
