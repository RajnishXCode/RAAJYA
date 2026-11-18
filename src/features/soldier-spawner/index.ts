/**
 * Event-facing entry point for the Royal Soldier Spawner station.
 *
 * The station's container UI opens on interaction (`show_ui_on_interaction`),
 * so deposits/withdrawals happen through the real container. We hook the
 * container open/close events (both carry the accessing player) to show status
 * and to process recruitment. A short per-player cooldown on close-processing
 * guards against duplicated close events for the same interaction.
 */

import { system, world } from "@minecraft/server";
import type { Block } from "@minecraft/server";
import { BLOCKS } from "../../core/ids";
import { COOLDOWN_TICKS } from "../../core/constants";
import { logError } from "../../utils/log";
import { isPlayer, processStationClose, showStationStatus } from "./station";

/** Player IDs currently within the close-processing cooldown window. */
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

/** Wire all station event handlers. Called once from main.ts. */
export function registerStationEvents(): void {
  // Status whenever a player opens the station UI.
  world.afterEvents.blockContainerOpened.subscribe((event) => {
    try {
      if (!isStation(event.block)) {
        return;
      }
      const player = event.openSource.entity;
      if (player && isPlayer(player)) {
        showStationStatus(player, event.block);
      }
    } catch (error) {
      logError("Station open handler error", error);
    }
  });

  // Process deposits/recruitment whenever a player closes the station UI.
  world.afterEvents.blockContainerClosed.subscribe((event) => {
    try {
      if (!isStation(event.block)) {
        return;
      }
      const player = event.closeSource.entity;
      if (!player || !isPlayer(player)) {
        return;
      }
      if (isOnCooldown(player.id)) {
        return;
      }
      startCooldown(player.id);
      processStationClose(event.block, player);
    } catch (error) {
      logError("Station close handler error", error);
    }
  });
}
