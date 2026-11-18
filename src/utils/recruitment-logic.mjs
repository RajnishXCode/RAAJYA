/**
 * Pure, dependency-free decision helpers for RAAJYA's recruitment flow.
 *
 * This module deliberately imports NOTHING (no `@minecraft/server`). It
 * operates on plain snapshots of inventory slots so the exact production
 * logic can be unit-tested with Node's built-in test runner
 * (`tests/recruitment.test.mjs`) without a running Minecraft world.
 *
 * The host-facing TypeScript layer (`src/features/**`) is responsible only
 * for translating between the live Script API objects and these plain
 * snapshots, and for applying the decisions back to the real inventory.
 */

// The Commander ID format is defined ONCE, here: e.g. "RAAJYA-7F31A9C2".
const ID_PREFIX = "RAAJYA-";
const ID_HEX_LENGTH = 8;
const ID_PATTERN = /^RAAJYA-[0-9A-F]{8}$/;

/** @typedef {{ typeId: string, amount: number }} SlotView */
/** @typedef {{ slot: number, commanderId?: string }} StoneView */
/** @typedef {{ slot: number, newAmount: number }} ConsumeStep */

/**
 * Total amount of `typeId` across every slot. `undefined` slots are ignored.
 *
 * @param {Array<SlotView | undefined>} slots
 * @param {string} typeId
 * @returns {number}
 */
export function countItem(slots, typeId) {
  let total = 0;
  for (const slot of slots) {
    if (slot && slot.typeId === typeId && slot.amount > 0) {
      total += slot.amount;
    }
  }
  return total;
}

/**
 * Build an EXACT consumption plan for `amount` items of `typeId`.
 *
 * Returns an ordered list of `{ slot, newAmount }` steps describing how to
 * reduce each matching stack, or `null` when there is not enough. The plan:
 *   - consumes exactly `amount` items (never more, never fewer);
 *   - spreads consumption across multiple stacks when needed;
 *   - preserves any remainder in a partially-used stack;
 *   - never touches unrelated items.
 *
 * This is a pure function: it does not mutate `slots`.
 *
 * @param {Array<SlotView | undefined>} slots
 * @param {string} typeId
 * @param {number} amount
 * @returns {ConsumeStep[] | null}
 */
export function planConsume(slots, typeId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  if (countItem(slots, typeId) < amount) {
    return null;
  }

  /** @type {ConsumeStep[]} */
  const plan = [];
  let remaining = amount;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i];
    if (!slot || slot.typeId !== typeId || slot.amount <= 0) {
      continue;
    }
    const take = Math.min(slot.amount, remaining);
    plan.push({ slot: i, newAmount: slot.amount - take });
    remaining -= take;
  }
  return remaining === 0 ? plan : null;
}

/**
 * Whether a value is a well-formed Commander ID (`RAAJYA-` + 8 uppercase hex).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidCommanderId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/**
 * Generate a fresh Commander ID. The `rng` argument makes it deterministic
 * for tests; in production it defaults to `Math.random` (the Bedrock
 * scripting host provides `Math`).
 *
 * @param {() => number} [rng] function returning a float in [0, 1)
 * @returns {string}
 */
export function generateCommanderId(rng = Math.random) {
  const digits = "0123456789ABCDEF";
  let suffix = "";
  for (let i = 0; i < ID_HEX_LENGTH; i++) {
    const index = Math.min(digits.length - 1, Math.max(0, Math.floor(rng() * digits.length)));
    suffix += digits.charAt(index);
  }
  return ID_PREFIX + suffix;
}

/**
 * Decide which Commander ID (if any) authorises a recruitment, given all
 * Commander Stones found in a player's inventory.
 *
 * Safety rules (see project spec §3 / §7):
 *   - 0 stones ................................ `none` (player needs a stone).
 *   - multiple stones with DIFFERENT valid IDs .. `conflict` (never guess).
 *   - multiple stones, any uninitialised ....... `multiple` (initialising one
 *     would create a second, unintended ID -> refuse to avoid silent ownership).
 *   - multiple stones, ALL the SAME valid ID ... `ok` (duplicated stone, safe).
 *   - exactly 1 stone with a valid ID ......... `ok` (reuse it).
 *   - exactly 1 stone with no valid ID ........ `ok` with an `initSlots` entry
 *     describing the ID the host must persist on that ItemStack.
 *
 * @param {StoneView[]} stones
 * @param {() => string} generateId
 * @returns {
 *   | { status: "ok", commanderId: string, initSlots: Array<{ slot: number, id: string }> }
 *   | { status: "none" }
 *   | { status: "multiple", count: number }
 *   | { status: "conflict", distinctIds: string[] }
 * }
 */
export function resolveCommanderStone(stones, generateId) {
  if (!Array.isArray(stones) || stones.length === 0) {
    return { status: "none" };
  }

  /** @type {string[]} */
  const definedIds = [];
  for (const stone of stones) {
    if (isValidCommanderId(stone.commanderId)) {
      definedIds.push(/** @type {string} */ (stone.commanderId));
    }
  }
  const distinctIds = [...new Set(definedIds)];

  // Different existing IDs are always ambiguous -> refuse.
  if (distinctIds.length > 1) {
    return { status: "conflict", distinctIds };
  }

  const anyMissingId = stones.some((stone) => !isValidCommanderId(stone.commanderId));

  if (stones.length > 1) {
    // Only safe when every stone already shares the exact same valid ID.
    if (anyMissingId || distinctIds.length === 0) {
      return { status: "multiple", count: stones.length };
    }
    return { status: "ok", commanderId: distinctIds[0], initSlots: [] };
  }

  // Exactly one Commander Stone.
  const stone = stones[0];
  if (isValidCommanderId(stone.commanderId)) {
    return { status: "ok", commanderId: /** @type {string} */ (stone.commanderId), initSlots: [] };
  }
  const newId = generateId();
  return { status: "ok", commanderId: newId, initSlots: [{ slot: stone.slot, id: newId }] };
}

/** Exposed for validation tooling / documentation. */
export const COMMANDER_ID_PREFIX = ID_PREFIX;
export const COMMANDER_ID_PATTERN = ID_PATTERN;
