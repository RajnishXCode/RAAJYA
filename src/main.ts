/**
 * RAAJYA — Script API entry point (@minecraft/server 2.x / "Scripting V2").
 *
 * Wiring only; the gameplay lives in `src/features/**`:
 *   - soldier-spawner: the station (real block-entity container) — deposits,
 *     status and recruitment are processed on container open/close.
 *   - commands: `/scriptevent raajya:cs stop|here|follow|defend|attack|patrol|
 *     status|radius <n>`, validated by Commander Stone ownership.
 *   - royal-guard: equipment, ownership and behavioural modes.
 *
 * Deliberately NOT used: block JSON custom components (they couple block
 * loading to script registration — the root cause of the original "spawner
 * item missing" failure), and any preview/beta APIs.
 */

import { system, world } from "@minecraft/server";
import { BLOCKS } from "./core/ids";
import { registerStationEvents } from "./features/soldier-spawner";
import { stationHasItems } from "./features/soldier-spawner/station";
import { registerCommandHandlers } from "./features/commands";
import { reapplyGuardMode } from "./features/royal-guard";
import { logError, logInfo } from "./utils/log";
import { stationNotEmpty } from "./utils/messages";

// ---- Station (container open/close) + commands + guard monitor -----------
registerStationEvents();
registerCommandHandlers();

// ---- Re-apply persisted guard modes when entities (re)load ---------------
world.afterEvents.entityLoad.subscribe((event) => {
  try {
    reapplyGuardMode(event.entity);
  } catch (error) {
    logError("Failed to re-apply guard mode on entity load", error);
  }
});

// ---- Preserve resources: refuse to break a station that still holds items -
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  try {
    if (event.block.typeId !== BLOCKS.ROYAL_SOLDIER_SPAWNER) {
      return;
    }
    if (stationHasItems(event.block)) {
      event.cancel = true;
      // Before-events run in restricted mode: defer feedback to the next tick.
      const player = event.player;
      system.run(() => {
        player.sendMessage(stationNotEmpty());
      });
    }
  } catch (error) {
    logError("Station break guard error", error);
  }
});

logInfo("RAAJYA initialised — Commander Stone / Royal Soldier Spawner / Royal Guard.");
