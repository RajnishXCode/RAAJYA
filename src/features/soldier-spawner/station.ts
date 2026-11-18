/**
 * The Royal Soldier Spawner station: a real block-entity container.
 *
 * The block JSON declares `minecraft:block_entity` with a 9-slot `container`
 * (the stable custom-block inventory API) whose UI opens on interaction, plus
 * per-instance dynamic properties. Storage IS the container: players deposit
 * Emerald Blocks through the station UI, take them back out any time, and
 * every `EMERALD_COST` stored blocks funds exactly one soldier — processed
 * when a player closes the station (and summarised whenever it is opened).
 */

import type {
  Block,
  BlockDynamicPropertiesComponent,
  BlockInventoryComponent,
  Container,
  Entity,
  Player,
} from "@minecraft/server";
import { BLOCKS, VANILLA } from "../../core/ids";
import { EMERALD_COST, PROP_STATION_RECRUITED } from "../../core/constants";
import { countEmeraldBlocks, ejectCommanderStones } from "./inventory";
import { recruit } from "./recruitment";
import { getSpawnRadius } from "./spawn";
import {
  failureMessage,
  stationStatusText,
  stoneEjected,
  stoneRequiredStation,
  successMessage,
} from "../../utils/messages";

/** Narrow an entity to the player that triggered a container access. */
export function isPlayer(entity: Entity): entity is Player {
  return entity.typeId === VANILLA.PLAYER;
}

/** The station's real container (block-entity inventory), or undefined. */
export function getStationContainer(block: Block): Container | undefined {
  if (block.typeId !== BLOCKS.ROYAL_SOLDIER_SPAWNER || !block.isValid) {
    return undefined;
  }
  const component = block.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined;
  const container = component?.container;
  return container && container.isValid ? container : undefined;
}

/** Emerald Blocks currently stored in the station (its container contents). */
export function getStationStored(block: Block): number {
  const container = getStationContainer(block);
  return container ? countEmeraldBlocks(container) : 0;
}

function getProperties(block: Block): BlockDynamicPropertiesComponent | undefined {
  return block.getComponent("minecraft:dynamic_properties") as
    | BlockDynamicPropertiesComponent
    | undefined;
}

/** Total soldiers ever recruited from this station (per-instance counter). */
export function getStationRecruited(block: Block): number {
  const properties = getProperties(block);
  if (!properties) {
    return 0;
  }
  const value = properties.get(PROP_STATION_RECRUITED);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function bumpStationRecruited(block: Block, delta: number): void {
  const properties = getProperties(block);
  if (!properties) {
    return; // The counter is cosmetic; never let it break recruitment.
  }
  properties.set(PROP_STATION_RECRUITED, getStationRecruited(block) + delta);
}

/** True when the station container holds anything at all. */
export function stationHasItems(block: Block): boolean {
  const container = getStationContainer(block);
  if (!container) {
    return false;
  }
  for (let slot = 0; slot < container.size; slot++) {
    if (container.getItem(slot)) {
      return true;
    }
  }
  return false;
}

/** Show the station status line (chat + action bar). */
export function showStationStatus(player: Player, block: Block): void {
  const text = stationStatusText(
    getStationStored(block),
    getStationRecruited(block),
    getSpawnRadius(),
  );
  player.sendMessage(text);
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // The action bar is cosmetic; the chat message above already covers it.
  }
}

/**
 * Process a station close: eject any Commander Stones the player may have
 * dropped into the UI, then recruit one soldier per EMERALD_COST stored
 * Emerald Blocks (if the closing player holds a valid Commander Stone).
 * On any failure the stored blocks remain safely in the station.
 */
export function processStationClose(block: Block, player: Player): void {
  const container = getStationContainer(block);
  if (!container) {
    return;
  }

  // The Commander Stone is never deposited: hand any back before anything else.
  if (ejectCommanderStones(container, player) > 0) {
    player.sendMessage(stoneEjected());
  }

  const stored = countEmeraldBlocks(container);
  if (stored < EMERALD_COST) {
    showStationStatus(player, block);
    return;
  }

  const affordable = Math.floor(stored / EMERALD_COST);
  const result = recruit(player, block, container, affordable);
  if (result.ok) {
    bumpStationRecruited(block, result.recruited);
    player.sendMessage(successMessage(result.commanderId, result.recruited));
  } else {
    switch (result.reason) {
      case "no_commander_stone":
      case "multiple_commander_stones":
      case "conflicting_commander_stones":
      case "commander_id_unsupported":
        player.sendMessage(stoneRequiredStation(stored));
        break;
      default:
        player.sendMessage(failureMessage(result.reason));
    }
  }
  showStationStatus(player, block);
}
