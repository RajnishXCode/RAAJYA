/**
 * Event-facing entry point for the Royal Soldier Spawner.
 *
 * A single interaction can be delivered by BOTH the V2 custom block component
 * (`onPlayerInteract`) and the global `playerInteractWithBlock` event. A
 * per-player cooldown is set at the START of every attempt, so whichever
 * source fires first wins and the other is suppressed. This guarantees:
 *   - exactly one recruitment (and one message) per interaction;
 *   - no duplicate Emerald consumption or duplicate soldiers;
 *   - rapid interaction bursts are debounced.
 */

import { system, type Block, type Player } from "@minecraft/server";
import { COOLDOWN_TICKS } from "../../core/constants";
import { failureMessage, successMessage } from "../../utils/messages";
import { logError } from "../../utils/log";
import { recruit } from "./recruitment";

/** Player IDs currently within the interaction cooldown window. */
const cooldowns = new Set<string>();

export function handleSpawnerInteraction(player: Player, spawner: Block): void {
  const playerId = player.id;

  // Deduplicate the two event sources and debounce rapid interactions.
  if (cooldowns.has(playerId)) {
    return;
  }
  cooldowns.add(playerId);
  system.runTimeout(() => cooldowns.delete(playerId), COOLDOWN_TICKS);

  try {
    const result = recruit(player, spawner);
    player.sendMessage(result.ok ? successMessage(result.commanderId) : failureMessage(result.reason));
  } catch (error) {
    // Last-resort guard: never let a script exception break the interaction.
    logError("Unexpected error during recruitment", error);
    player.sendMessage(failureMessage("recruitment_error"));
  }
}
