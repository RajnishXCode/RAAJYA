/** Shared result/record types used across features. */

/** One step of an exact-consumption plan: reduce `slot` to `newAmount`. */
export interface ConsumeStep {
  slot: number;
  newAmount: number;
}

/**
 * Behavioural mode of a Royal Guard. Maps 1:1 to `raajya:mode_*` entity
 * events / component groups in the entity JSON, and to the `/scriptevent
 * raajya:cs <mode>` commands.
 */
export type GuardMode = "stop" | "here" | "follow" | "defend" | "attack" | "patrol";

/** Why a recruitment attempt was refused (drives player-facing messages). */
export type RecruitmentFailure =
  | "no_inventory"
  | "no_commander_stone"
  | "multiple_commander_stones"
  | "conflicting_commander_stones"
  | "commander_id_unsupported"
  | "insufficient_emeralds"
  | "no_safe_spawn"
  | "recruitment_error";

export interface RecruitmentSuccess {
  ok: true;
  commanderId: string;
  recruited: number;
}

export interface RecruitmentFailureResult {
  ok: false;
  reason: RecruitmentFailure;
}

export type RecruitmentResult = RecruitmentSuccess | RecruitmentFailureResult;

/**
 * Outcome of resolving which Commander ID authorises an action.
 * Mirrors the return shape of `resolveCommanderStone` in
 * `utils/recruitment-logic.mjs` (plus a host-side `unsupported` case).
 */
export type CommanderResolution =
  | { status: "ok"; commanderId: string; initSlots: Array<{ slot: number; id: string }> }
  | { status: "none" }
  | { status: "multiple"; count: number }
  | { status: "conflict"; distinctIds: string[] }
  | { status: "unsupported" };
