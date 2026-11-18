/** Player-facing chat messages, kept in one place for easy localisation later. */

import type { RecruitmentFailure } from "../core/types";
import { EMERALD_COST, MESSAGE_PREFIX } from "../core/constants";

const FAILURE_MESSAGES: Record<RecruitmentFailure, string> = {
  no_inventory: "§cCould not access your inventory.",
  no_commander_stone: "§cYou need a Commander Stone in your inventory to recruit a Royal Guard.",
  multiple_commander_stones:
    "§cYou are carrying multiple Commander Stones. Keep exactly one to recruit, so ownership is never ambiguous.",
  conflicting_commander_stones:
    "§cYour Commander Stones have different Commander IDs. Carry exactly one stone to avoid assigning a soldier to the wrong commander.",
  commander_id_unsupported:
    "§cCould not initialise the Commander Stone (it must be non-stackable). Check the pack's item definition.",
  insufficient_emeralds: `§cYou need ${EMERALD_COST} Emerald Blocks to recruit a Royal Guard.`,
  no_safe_spawn: "§cThere is no safe, unoccupied space to recruit a soldier here. Clear some room around the spawner.",
  recruitment_error: "§cRecruitment failed unexpectedly. Nothing was consumed — please try again.",
};

export function failureMessage(reason: RecruitmentFailure): string {
  return MESSAGE_PREFIX + FAILURE_MESSAGES[reason];
}

export function successMessage(commanderId: string): string {
  return MESSAGE_PREFIX + `§aA Royal Guard has been recruited under §e${commanderId}§a.`;
}
