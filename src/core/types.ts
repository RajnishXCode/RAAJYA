/** Shared result/record types used across features. */

/** One step of an exact-consumption plan: reduce `slot` to `newAmount`. */
export interface ConsumeStep {
  slot: number;
  newAmount: number;
}

/**
 * Outcome of resolving which Commander ID authorises a recruitment.
 * Mirrors the return shape of `resolveCommanderStone` in
 * `utils/recruitment-logic.mjs` (plus a host-side `unsupported` case).
 */
export type CommanderResolution =
  | { status: "ok"; commanderId: string; initSlots: Array<{ slot: number; id: string }> }
  | { status: "none" }
  | { status: "multiple"; count: number }
  | { status: "conflict"; distinctIds: string[] }
  | { status: "unsupported" };

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
}

export interface RecruitmentFailureResult {
  ok: false;
  reason: RecruitmentFailure;
}

export type RecruitmentResult = RecruitmentSuccess | RecruitmentFailureResult;
