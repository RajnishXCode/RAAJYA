/** Player-facing chat messages, kept in one place for easy localisation later. */

import type { GuardMode, RecruitmentFailure } from "../core/types";
import { EMERALD_COST, MESSAGE_PREFIX } from "../core/constants";

const FAILURE_MESSAGES: Record<RecruitmentFailure, string> = {
  no_inventory: "§cCould not access your inventory.",
  no_commander_stone: "§cYou need a Commander Stone in your inventory to recruit Royal Guards.",
  multiple_commander_stones:
    "§cYou are carrying multiple Commander Stones. Keep exactly one to recruit, so ownership is never ambiguous.",
  conflicting_commander_stones:
    "§cYour Commander Stones have different Commander IDs. Carry exactly one stone to avoid assigning a soldier to the wrong commander.",
  commander_id_unsupported:
    "§cCould not initialise the Commander Stone (it must be non-stackable). Check the pack's item definition.",
  insufficient_emeralds: `§cRecruiting needs ${EMERALD_COST} Emerald Blocks per soldier.`,
  no_safe_spawn: "§cThere is no safe, unoccupied space to recruit a soldier here. Clear some room around the station.",
  recruitment_error: "§cRecruitment failed unexpectedly. Nothing was consumed — please try again.",
};

export function failureMessage(reason: RecruitmentFailure): string {
  return MESSAGE_PREFIX + FAILURE_MESSAGES[reason];
}

export function successMessage(commanderId: string, count: number): string {
  const noun = count === 1 ? "Royal Guard has" : "Royal Guards have";
  return MESSAGE_PREFIX + `§a${count} ${noun} been recruited under §e${commanderId}§a.`;
}

/** Compact station status line (also used for the action bar). */
export function stationStatusText(stored: number, recruited: number, radius: number): string {
  const next = stored % EMERALD_COST;
  return (
    `§6Royal Soldier Spawner§r — stored: §a${stored}§r Emerald Block${stored === 1 ? "" : "s"} ` +
    `(§e${next}/${EMERALD_COST}§r to next soldier) · recruited here: §b${recruited}§r · spawn radius: §d${radius}§r`
  );
}

/**
 * Status line for the interact (inventory) economy: reports the Emerald
 * Blocks the interacting player carries rather than station storage.
 */
export function stationCarryText(carried: number, recruited: number, radius: number): string {
  const next = carried % EMERALD_COST;
  return (
    `§6Royal Soldier Spawner§r — you carry §a${carried}§r Emerald Block${carried === 1 ? "" : "s"} ` +
    `(§e${next}/${EMERALD_COST}§r to next soldier) · recruited here: §b${recruited}§r · spawn radius: §d${radius}§r`
  );
}

export function stoneRequiredStation(stored: number): string {
  return (
    MESSAGE_PREFIX +
    `§cA Commander Stone in your inventory is required to recruit. §r${stored} Emerald Block${stored === 1 ? "" : "s"} ` +
    "remain safely stored in the station."
  );
}

/** Interact-economy variant: nothing is stored, so report what is carried. */
export function stoneRequiredInteract(carried: number): string {
  return (
    MESSAGE_PREFIX +
    `§cA Commander Stone in your inventory is required to recruit. §rYou carry ${carried} Emerald Block${carried === 1 ? "" : "s"}.`
  );
}

export function stoneEjected(): string {
  return MESSAGE_PREFIX + "§eYour Commander Stone was returned — it is never deposited or consumed.";
}

export function stationNotEmpty(): string {
  return MESSAGE_PREFIX + "§cWithdraw all items from the station before breaking it (your resources are preserved).";
}

export function commandAck(mode: GuardMode, count: number, commanderId: string): string {
  const noun = count === 1 ? "Royal Guard" : "Royal Guards";
  return MESSAGE_PREFIX + `§a${count} ${noun} §e${mode}§a. (Commander ${commanderId})`;
}

export function noOwnedGuards(commanderId: string): string {
  return MESSAGE_PREFIX + `§cYou command no Royal Guards under ${commanderId}. Recruit some at a Royal Soldier Spawner.`;
}

export function radiusSet(radius: number): string {
  return MESSAGE_PREFIX + `§aSoldier spawn radius set to §e${radius}§a blocks.`;
}

export function unknownCommand(command: string): string {
  return (
    MESSAGE_PREFIX +
    `§cUnknown command "§e${command}§c". Valid: stop, here, follow, defend, attack, patrol, status, radius <1-16>, debug.`
  );
}

export function statusHeader(commanderId: string, count: number): string {
  const noun = count === 1 ? "Royal Guard" : "Royal Guards";
  return MESSAGE_PREFIX + `§aYou command §e${count}§a ${noun} under §e${commanderId}§a:`;
}

export function statusLine(mode: string, count: number): string {
  return `§7 - §e${mode}§7: §f${count}`;
}
