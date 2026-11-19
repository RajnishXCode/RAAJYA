/**
 * `/scriptevent raajya:cs <command>` — the soldier command system.
 *
 * Commands (validated against the issuing player's Commander Stone; only
 * guards carrying THAT Commander ID are affected):
 *   stop    – stand fast, no targeting
 *   here    – real pathfinding march to the commander, then hold (stop)
 *   follow  – trail the commander (vanilla follow_owner pathfinding)
 *   defend  – stay with the commander and attack hostile mobs that threaten
 *             them (owner_hurt_by_target / owner_hurt_target + short-range
 *             hostile targeting)
 *   attack  – hunt hostile mobs in a wide radius
 *   patrol  – wander the area around their post and engage hostiles met
 *   status  – report owned soldier count per mode
 *   radius <1-16> – configure the station soldier spawn radius (default 4)
 *
 * Guards never target players (entity filters exclude the player family in
 * every targeting behavior and in hurt_by_target), so they only ever fight
 * hostile ("monster" family) mobs or non-player attackers.
 */

import { system, world } from "@minecraft/server";
import type { Entity, Player, ScriptEventCommandMessageAfterEvent } from "@minecraft/server";
import { COMMAND_EVENT_ID, HERE_ARRIVE_DISTANCE, GUARD_MONITOR_INTERVAL_TICKS, MESSAGE_PREFIX } from "../../core/constants";
import type { GuardMode } from "../../core/types";
import {
  commandAck,
  noOwnedGuards,
  radiusSet,
  statusHeader,
  statusLine,
  unknownCommand,
} from "../../utils/messages";
import { parseCommandMessage, isGuardMode } from "../../utils/recruitment-logic.mjs";
import { logError } from "../../utils/log";
import { acquireCommanderId } from "../commander-stone";
import {
  findOwnedGuards,
  getGuardMode,
  getGuardOwner,
  setGuardMode,
} from "../royal-guard";
import { getInventoryContainer } from "../soldier-spawner/inventory";
import { setSpawnRadius } from "../soldier-spawner/spawn";

function resolveCommander(player: Player): string | undefined {
  const container = getInventoryContainer(player);
  if (!container) {
    return undefined;
  }
  const resolution = acquireCommanderId(container);
  return resolution.status === "ok" ? resolution.commanderId : undefined;
}

function handleModeCommand(player: Player, mode: GuardMode): void {
  const commanderId = resolveCommander(player);
  if (!commanderId) {
    player.sendMessage(noOwnedGuards("?"));
    return;
  }
  const guards = findOwnedGuards(player.dimension, commanderId);
  if (guards.length === 0) {
    player.sendMessage(noOwnedGuards(commanderId));
    return;
  }
  for (const guard of guards) {
    setGuardMode(guard, mode);
  }
  player.sendMessage(commandAck(mode, guards.length, commanderId));
}

function handleStatusCommand(player: Player): void {
  const commanderId = resolveCommander(player);
  if (!commanderId) {
    player.sendMessage(noOwnedGuards("?"));
    return;
  }
  const guards = findOwnedGuards(player.dimension, commanderId);
  if (guards.length === 0) {
    player.sendMessage(noOwnedGuards(commanderId));
    return;
  }
  player.sendMessage(statusHeader(commanderId, guards.length));
  const counts = new Map<string, number>();
  for (const guard of guards) {
    const mode = getGuardMode(guard);
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  for (const [mode, count] of counts) {
    player.sendMessage(statusLine(mode, count));
  }
}

/**
 * `/scriptevent raajya:cs debug` — remote diagnostics: reports exactly what
 * the script sees (commander, owned guards, per-guard mode/owner/distance).
 * Used to pinpoint where the command -> event -> behavior chain breaks.
 */
function handleDebugCommand(player: Player): void {
  const commanderId = resolveCommander(player);
  const lines = [
    `§7script: running · event id "${COMMAND_EVENT_ID}" · engine ${player.dimension.id}`,
    `§7commander: ${commanderId ?? "none — carry exactly one Commander Stone"}`,
  ];
  if (!commanderId) {
    player.sendMessage(MESSAGE_PREFIX + lines.join("\n§r"));
    return;
  }
  const guards = findOwnedGuards(player.dimension, commanderId);
  lines.push(`§7owned guards in this dimension: ${guards.length}`);
  for (const guard of guards) {
    const owner = getGuardOwner(guard);
    const dx = guard.location.x - player.location.x;
    const dy = guard.location.y - player.location.y;
    const dz = guard.location.z - player.location.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    lines.push(
      `§7 - guard ${String(guard.id).slice(0, 8)}: mode=§e${getGuardMode(guard)}§r` +
        ` §7owner=${owner?.name ?? "?"} dist=${distance.toFixed(1)} valid=${guard.isValid}`,
    );
  }
  player.sendMessage(MESSAGE_PREFIX + lines.join("\n§r"));
}

/** Dispatch one inbound `/scriptevent raajya:cs ...` command. */
export function handleScriptEvent(event: ScriptEventCommandMessageAfterEvent): void {
  if (event.id !== COMMAND_EVENT_ID) {
    return;
  }
  const source = event.sourceEntity;
  if (!source || source.typeId !== "minecraft:player") {
    return;
  }
  const player = source as Player;
  const { command, arg } = parseCommandMessage(event.message);

  try {
    if (isGuardMode(command)) {
      handleModeCommand(player, command as GuardMode);
    } else if (command === "status") {
      handleStatusCommand(player);
    } else if (command === "debug") {
      handleDebugCommand(player);
    } else if (command === "radius") {
      const radius = setSpawnRadius(Number(arg));
      player.sendMessage(radiusSet(radius));
    } else {
      player.sendMessage(unknownCommand(command));
    }
  } catch (error) {
    logError(`Command "raajya:cs ${command}" failed`, error);
    player.sendMessage(unknownCommand(command));
  }
}

/**
 * Guard monitor: guards in "here" mode march to their commander using real
 * pathfinding (follow_owner); once they arrive within HERE_ARRIVE_DISTANCE
 * they switch to "stop" so they form up and hold position. Runs on a low
 * interval; ownership is re-checked per guard.
 */
function monitorHereMode(): void {
  for (const player of world.getAllPlayers()) {
    let nearby: Entity[];
    try {
      nearby = player.dimension.getEntities({
        type: "raajya:royal_guard",
        location: player.location,
        maxDistance: 48,
      });
    } catch {
      continue;
    }
    for (const guard of nearby) {
      if (!guard.isValid || getGuardMode(guard) !== "here") {
        continue;
      }
      const owner = getGuardOwner(guard);
      if (!owner || owner.id !== player.id) {
        continue;
      }
      const dx = guard.location.x - player.location.x;
      const dz = guard.location.z - player.location.z;
      const dy = guard.location.y - player.location.y;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance <= HERE_ARRIVE_DISTANCE) {
        setGuardMode(guard, "stop");
      }
    }
  }
}

/** Wire all command handlers. Called once from main.ts. */
export function registerCommandHandlers(): void {
  system.afterEvents.scriptEventReceive.subscribe(handleScriptEvent);
  system.runInterval(monitorHereMode, GUARD_MONITOR_INTERVAL_TICKS);
}
