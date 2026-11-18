/**
 * RAAJYA — Script API entry point (@minecraft/server 2.x / "Scripting V2").
 *
 * Spawner interaction is delivered through the modern, block-scoped V2 custom
 * component (`raajya:spawner_interact`), registered at `system.beforeEvents.
 * startup`. The component id is bound to the block in its JSON definition.
 *
 * A global `playerInteractWithBlock` subscription is kept as a deduplicated
 * fallback: the research for this project found that the after-event alone is
 * not guaranteed to fire for a plain full-cube block on every build, while a
 * custom component's `onPlayerInteract` is. Both funnel through
 * `handleSpawnerInteraction`, whose per-player cooldown prevents any double
 * recruitment or duplicate message.
 *
 * Nothing else is registered in this phase: there is deliberately no `/cs`
 * command, combat AI, patrol AI, or Barracks.
 */

import { system, world } from "@minecraft/server";
import { BLOCKS } from "./core/ids";
import { SPAWNER_COMPONENT_ID } from "./core/constants";
import { handleSpawnerInteraction } from "./features/soldier-spawner";
import { logError, logInfo } from "./utils/log";

// ---- Primary: V2 custom block component ---------------------------------
system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.blockComponentRegistry.registerCustomComponent(SPAWNER_COMPONENT_ID, {
    onPlayerInteract: (event) => {
      // `player` is optional on this event type; guard before recruiting.
      if (!event.player) {
        return;
      }
      handleSpawnerInteraction(event.player, event.block);
    },
  });
});

// ---- Fallback: global block-interaction event ----------------------------
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.block.typeId !== BLOCKS.ROYAL_SOLDIER_SPAWNER) {
    return;
  }
  // Only the initial press of an interaction, not held-button repeats.
  if (!event.isFirstEvent) {
    return;
  }
  try {
    handleSpawnerInteraction(event.player, event.block);
  } catch (error) {
    logError("Unhandled spawner interaction error", error);
  }
});

logInfo("RAAJYA initialised — Commander Stone / Royal Soldier Spawner / Royal Guard.");
