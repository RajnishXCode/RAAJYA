/**
 * Unit tests for RAAJYA's PURE recruitment decision logic.
 *
 * These import the exact same module (`src/utils/recruitment-logic.mjs`) that
 * the shipped Script API bundle uses, so they validate real production
 * behaviour without needing a running Minecraft world.
 *
 * Run with: npm test   (node --test tests/*.test.mjs)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countItem,
  planConsume,
  generateCommanderId,
  isValidCommanderId,
  resolveCommanderStone,
  COMMANDER_ID_PREFIX,
  recruitableCount,
  progressToNextSoldier,
  clampSpawnRadius,
  parseCommandMessage,
  isGuardMode,
} from "../src/utils/recruitment-logic.mjs";

const EMERALD = "minecraft:emerald_block";
const STONE = "raajya:commander_stone";

/** Build an inventory snapshot array (index-aligned, undefined = empty slot). */
function inv(...entries) {
  return entries.map((entry, i) => {
    if (entry === undefined) return undefined; // empty inventory slot
    const [typeId, amount] = entry;
    return { slot: i, typeId, amount };
  });
}

// ---------------------------------------------------------------------------
// countItem
// ---------------------------------------------------------------------------
test("countItem sums an item across multiple stacks", () => {
  const slots = inv([EMERALD, 3], ["minecraft:dirt", 10], [EMERALD, 2], undefined, [EMERALD, 1]);
  assert.equal(countItem(slots, EMERALD), 6);
});

test("countItem ignores unrelated items and empty slots", () => {
  const slots = inv(["minecraft:diamond_block", 9], undefined, [EMERALD, 0]);
  assert.equal(countItem(slots, EMERALD), 0);
  assert.equal(countItem(slots, "minecraft:diamond_block"), 9);
});

// ---------------------------------------------------------------------------
// planConsume — the "exactly five, across stacks, preserve remainder" core
// ---------------------------------------------------------------------------
test("planConsume consumes exactly N from a single large stack and preserves the remainder", () => {
  const slots = inv([EMERALD, 12], ["minecraft:stone", 5]);
  const plan = planConsume(slots, EMERALD, 5);
  assert.deepEqual(plan, [{ slot: 0, newAmount: 7 }]);
  // Input is NOT mutated (pure function).
  assert.equal(slots[0].amount, 12);
});

test("planConsume spreads consumption across multiple stacks", () => {
  const slots = inv([EMERALD, 2], ["minecraft:dirt", 1], [EMERALD, 2], [EMERALD, 4]);
  const plan = planConsume(slots, EMERALD, 5);
  // 2 (slot0) + 2 (slot2) + 1 of slot3 (4 -> 3)
  assert.deepEqual(plan, [
    { slot: 0, newAmount: 0 },
    { slot: 2, newAmount: 0 },
    { slot: 3, newAmount: 3 },
  ]);
  const consumed = plan.reduce((acc, step) => acc + (slots[step.slot].amount - step.newAmount), 0);
  assert.equal(consumed, 5, "must consume exactly 5, no more, no fewer");
});

test("planConsume returns null when there are not enough items", () => {
  const slots = inv([EMERALD, 3], [EMERALD, 1]); // total 4
  assert.equal(planConsume(slots, EMERALD, 5), null);
});

test("planConsume rejects invalid amounts", () => {
  const slots = inv([EMERALD, 10]);
  assert.equal(planConsume(slots, EMERALD, 0), null);
  assert.equal(planConsume(slots, EMERALD, -3), null);
  assert.equal(planConsume(slots, EMERALD, 2.5), null);
});

test("planConsume returns null when the required amount is zero after filtering", () => {
  const slots = inv([EMERALD, 5]);
  assert.equal(planConsume(slots, "minecraft:emerald_block", 5).length, 1);
  assert.equal(planConsume(slots, "minecraft:diamond_block", 1), null);
});

// ---------------------------------------------------------------------------
// Commander ID generation / validation
// ---------------------------------------------------------------------------
test("generateCommanderId produces a deterministic, well-formed ID", () => {
  const seq = [0, 1, 2, 3, 4, 5, 6, 7];
  let i = 0;
  const id = generateCommanderId(() => seq[i++] / 16);
  assert.equal(id, "RAAJYA-01234567");
  assert.equal(isValidCommanderId(id), true);
  assert.equal(COMMANDER_ID_PREFIX, "RAAJYA-");
});

test("generateCommanderId clamps out-of-range rng values and always yields 8 hex chars", () => {
  const id = generateCommanderId(() => 1.5); // -> clamped to 'F'
  assert.equal(id, "RAAJYA-FFFFFFFF");
  assert.equal(isValidCommanderId(id), true);
});

test("isValidCommanderId rejects malformed values", () => {
  assert.equal(isValidCommanderId("RAAJYA-7F31A9C2"), true);
  assert.equal(isValidCommanderId("RAAJYA-7f31a9c2"), false, "lowercase not allowed");
  assert.equal(isValidCommanderId("RAAJYA-7F31A9C"), false, "too short");
  assert.equal(isValidCommanderId("RAAJYA-7F31A9C22"), false, "too long");
  assert.equal(isValidCommanderId("OTHER-7F31A9C2"), false);
  assert.equal(isValidCommanderId(12345), false);
  assert.equal(isValidCommanderId(undefined), false);
  assert.equal(isValidCommanderId("RAAJYA-7F31A9GZ"), false, "non-hex chars");
});

test("generateCommanderId gives distinct IDs for varied randomness", () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(generateCommanderId());
  assert.ok(ids.size > 190, "random IDs should be overwhelmingly unique");
});

// ---------------------------------------------------------------------------
// resolveCommanderStone — ownership ambiguity rules
// ---------------------------------------------------------------------------
test("no Commander Stone -> none", () => {
  assert.deepEqual(resolveCommanderStone([], () => "RAAJYA-AAAAAAAA"), { status: "none" });
});

test("one stone with an existing ID -> reuse it, no initialisation", () => {
  const stones = [{ slot: 3, commanderId: "RAAJYA-A1234567" }];
  assert.deepEqual(resolveCommanderStone(stones, () => "RAAJYA-BBBBBBBB"), {
    status: "ok",
    commanderId: "RAAJYA-A1234567",
    initSlots: [],
  });
});

test("one stone without an ID -> generate + return an initSlots write-back", () => {
  const stones = [{ slot: 7, commanderId: undefined }];
  const result = resolveCommanderStone(stones, () => "RAAJYA-C0FFEE00");
  assert.equal(result.status, "ok");
  assert.equal(result.commanderId, "RAAJYA-C0FFEE00");
  assert.deepEqual(result.initSlots, [{ slot: 7, id: "RAAJYA-C0FFEE00" }]);
});

test("a stone with a malformed ID is treated as uninitialised", () => {
  const stones = [{ slot: 1, commanderId: "garbage" }];
  const result = resolveCommanderStone(stones, () => "RAAJYA-DEADBEEF");
  assert.equal(result.status, "ok");
  assert.equal(result.commanderId, "RAAJYA-DEADBEEF");
  assert.deepEqual(result.initSlots, [{ slot: 1, id: "RAAJYA-DEADBEEF" }]);
});

test("multiple stones with DIFFERENT valid IDs -> conflict (never guess)", () => {
  const stones = [
    { slot: 0, commanderId: "RAAJYA-A1111111" },
    { slot: 1, commanderId: "RAAJYA-B2222222" },
  ];
  const result = resolveCommanderStone(stones, () => "RAAJYA-CCCCCCCC");
  assert.equal(result.status, "conflict");
  assert.deepEqual(result.distinctIds, ["RAAJYA-A1111111", "RAAJYA-B2222222"]);
});

test("multiple stones where one is uninitialised -> multiple (refuse)", () => {
  const stones = [
    { slot: 0, commanderId: "RAAJYA-A1111111" },
    { slot: 1, commanderId: undefined },
  ];
  const result = resolveCommanderStone(stones, () => "RAAJYA-CCCCCCCC");
  assert.equal(result.status, "multiple");
  assert.equal(result.count, 2);
});

test("multiple stones all uninitialised -> multiple (refuse)", () => {
  const stones = [
    { slot: 0, commanderId: undefined },
    { slot: 1, commanderId: undefined },
  ];
  const result = resolveCommanderStone(stones, () => "RAAJYA-CCCCCCCC");
  assert.equal(result.status, "multiple");
});

test("multiple stones all sharing the SAME valid ID -> ok (safe duplicate)", () => {
  const stones = [
    { slot: 0, commanderId: "RAAJYA-A1111111" },
    { slot: 4, commanderId: "RAAJYA-A1111111" },
  ];
  const result = resolveCommanderStone(stones, () => "RAAJYA-CCCCCCCC");
  assert.equal(result.status, "ok");
  assert.equal(result.commanderId, "RAAJYA-A1111111");
  assert.deepEqual(result.initSlots, []);
});

// ---------------------------------------------------------------------------
// End-to-end simulation of the recruitment decision (pure parts)
// ---------------------------------------------------------------------------
test("recruitment simulation: valid stone + >=5 emeralds -> consume exactly 5, assign same ID", () => {
  const commanderId = "RAAJYA-A1234567";
  const stones = [{ slot: 0, commanderId }];
  const resolution = resolveCommanderStone(stones, () => "RAAJYA-UNUSED00");
  assert.equal(resolution.status, "ok");

  const slots = inv([STONE, 1], [EMERALD, 3], ["minecraft:dirt", 4], [EMERALD, 6]);
  const plan = planConsume(slots, EMERALD, 5);
  assert.ok(plan, "must have enough emeralds");

  const totalConsumed = plan.reduce((acc, step) => acc + (slots[step.slot].amount - step.newAmount), 0);
  assert.equal(totalConsumed, 5, "exactly 5 emerald blocks consumed");

  // Commander Stone untouched.
  assert.equal(slots[0].typeId, STONE);
  assert.equal(slots[0].amount, 1);
  // Unrelated item untouched.
  assert.equal(slots[2].typeId, "minecraft:dirt");
  // Remainder preserved: 3 + 6 = 9 total, 5 consumed, 4 remain.
  const remaining = plan.reduce((acc, step) => acc + step.newAmount, 0) +
    slots.filter((s, i) => s && s.typeId === EMERALD && !plan.some((p) => p.slot === i)).reduce((a, s) => a + s.amount, 0);
  assert.equal(remaining, 4, "remaining emerald blocks preserved");
  // Ownership would be assigned from the stone's ID.
  assert.equal(resolution.commanderId, commanderId);
});

test("recruitment simulation: insufficient emeralds -> no consumption, no spawn", () => {
  const slots = inv([STONE, 1], [EMERALD, 4]);
  assert.equal(countItem(slots, EMERALD), 4);
  assert.equal(planConsume(slots, EMERALD, 5), null, "must refuse to consume when short");
});

// ---------------------------------------------------------------------------
// Station economy (pure parts)
// ---------------------------------------------------------------------------
test("recruitableCount computes soldiers funded by stored emerald blocks", () => {
  assert.equal(recruitableCount(0, 5), 0);
  assert.equal(recruitableCount(4, 5), 0);
  assert.equal(recruitableCount(5, 5), 1);
  assert.equal(recruitableCount(12, 5), 2);
  assert.equal(recruitableCount(500, 5), 100);
  assert.equal(recruitableCount(-3, 5), 0, "negative storage funds nothing");
  assert.equal(recruitableCount(10, 0), 0, "invalid cost");
  assert.equal(recruitableCount(10, 2.5), 0, "non-integer cost");
  assert.equal(recruitableCount(NaN, 5), 0);
});

test("progressToNextSoldier reports blocks still needed", () => {
  assert.equal(progressToNextSoldier(0, 5), 5);
  assert.equal(progressToNextSoldier(2, 5), 3);
  assert.equal(progressToNextSoldier(5, 5), 5, "exactly funded -> full cost for the NEXT soldier");
  assert.equal(progressToNextSoldier(7, 5), 3);
});

test("station simulation: 13 stored + stone -> 2 soldiers, 3 blocks remain stored", () => {
  const stored = 13;
  const soldiers = recruitableCount(stored, 5);
  assert.equal(soldiers, 2);
  const consumed = soldiers * 5;
  assert.equal(consumed, 10);
  assert.equal(stored - consumed, 3, "remainder preserved in the station");
  assert.equal(progressToNextSoldier(stored - consumed, 5), 2);
});

test("station simulation: no stone -> nothing consumed", () => {
  const stored = 9;
  const resolution = resolveCommanderStone([], () => "RAAJYA-AAAAAAAA");
  assert.equal(resolution.status, "none");
  assert.equal(recruitableCount(stored, 5), 1, "affordable — but no stone means no recruitment");
  assert.equal(stored, 9, "storage untouched");
});

// ---------------------------------------------------------------------------
// Guard modes + command parsing
// ---------------------------------------------------------------------------
test("isGuardMode validates the seven command modes", () => {
  for (const mode of ["stop", "here", "follow", "defend", "attack", "patrol"]) {
    assert.equal(isGuardMode(mode), true, mode);
  }
  assert.equal(isGuardMode("status"), false, "status is a query, not a mode");
  assert.equal(isGuardMode("radius"), false);
  assert.equal(isGuardMode("STOP"), false, "modes are case-sensitive (commands are lowercased first)");
  assert.equal(isGuardMode(undefined), false);
  assert.equal(isGuardMode(123), false);
});

test("clampSpawnRadius enforces 1..16 with default 4", () => {
  assert.equal(clampSpawnRadius(undefined), 4);
  assert.equal(clampSpawnRadius(null), 4);
  assert.equal(clampSpawnRadius("nope"), 4);
  assert.equal(clampSpawnRadius(0), 1, "clamped up to the minimum");
  assert.equal(clampSpawnRadius(-5), 1);
  assert.equal(clampSpawnRadius(4), 4);
  assert.equal(clampSpawnRadius(7.6), 8, "rounded");
  assert.equal(clampSpawnRadius(99), 16);
});

test("parseCommandMessage splits command and argument", () => {
  assert.deepEqual(parseCommandMessage("follow"), { command: "follow", arg: "", raw: "follow" });
  assert.deepEqual(parseCommandMessage("  radius  6 "), { command: "radius", arg: "6", raw: "  radius  6 " });
  assert.deepEqual(parseCommandMessage("STATUS"), { command: "status", arg: "", raw: "STATUS" });
  assert.deepEqual(parseCommandMessage(undefined), { command: "", arg: "", raw: "" });
  assert.deepEqual(parseCommandMessage(""), { command: "", arg: "", raw: "" });
});
