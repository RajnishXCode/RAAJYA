# RAAJYA — Manual In-Game Test Checklist

> **Testing limitation (honest statement):** Minecraft Bedrock Edition **cannot be launched in the development environment** used to build this project. Therefore **no in-game test has been executed**. The offline validation that *was* run is listed at the bottom of this file. The checklist below must be performed by a human in Minecraft Bedrock **1.26.60** (or a compatible newer build) after importing `dist/RAAJYA.mcaddon`.

## Setup
- Use a fresh **Creative** test world (or a copy of a world you don't mind modifying).
- Import `RAAJYA.mcaddon`; ensure **both** the RAAJYA Behavior Pack and RAAJYA Resource Pack are active in the world.
- No experiments/experimental toggles are required on 1.26.60 (custom items, blocks, entities and the stable Script API are all out of preview).
- Keep the world's script/chat log visible (or enable content log errors) to observe the `[RAAJYA]` messages.

## Checklist

| # | Test | Expected result |
|---|------|-----------------|
| 1 | Import the `.mcaddon` (e.g. double-click / "Open with Minecraft"). | Minecraft imports **two** packs: RAAJYA Behavior Pack + RAAJYA Resource Pack. |
| 2 | Activate both packs in a test world (they are linked — activating one offers the other). | Both packs listed as active; no missing-dependency error. |
| 3 | Obtain a **Commander Stone** (Creative inventory → Items). | Item present, correct name/icon, **stack size 1** (you cannot stack two into one slot). |
| 4 | Interact with a spawner (or first initialization) and inspect the stone. | Its lore shows a persistent unique ID like `RAAJYA-7F31A9C2`; save, exit, reload the world → **ID unchanged**; move it between slots → **ID unchanged**. |
| 5 | Craft the spawner: place **9 Diamond Blocks** in all 9 crafting-table slots. | Produces **1 Royal Soldier Spawner**; exactly 9 Diamond Blocks consumed. |
| 6 | Place the spawner **anywhere** (e.g. open ground, on a wall-side block). | Block places with its royal/gold texture and display name; breakable (drops itself). |
| 7 | Interact with the spawner **without** any Commander Stone. | Clear error message ("You need a Commander Stone…"); **no soldier spawns**, **no Emeralds consumed**. |
| 8 | With a Commander Stone but **fewer than 5 Emerald Blocks** (e.g. 4). | Clear "You need 5 Emerald Blocks" message; **no spawn**, **no Emeralds consumed**. |
| 9 | With a Commander Stone + **≥ 5 Emerald Blocks**, interact with the spawner. | Exactly **one** Royal Guard spawns at a safe nearby position; success message shows the Commander ID. |
| 10 | Re-count Emerald Blocks after step 9. | **Exactly 5** consumed, remainder preserved (including when split across several stacks — test with e.g. 3 + 2 + 4). |
| 11 | Check the Commander Stone after recruitment. | Still in inventory, **not consumed**, ID unchanged. |
| 12 | Interact with the **same** spawner again. | It still works (reusable); another guard spawns; spawner **not consumed**. |
| 13 | Recruit **multiple** soldiers (repeat 9). | Each recruitment costs exactly 5 Emerald Blocks and spawns exactly one guard; rapid double-clicks do **not** duplicate a recruitment (1 s cooldown). |
| 14 | Verify every guard has the **correct Commander ID**. | All guards recruited with the same stone carry the same ID (persisted on the entity; survives world save/reload). Use a behaviour-log command/add-on or a temporary debug script reading `getDynamicProperty("raajya:commander_id")`. |
| 15 | **Multiplayer:** Player A with stone `RAAJYA-A…` and Player B with stone `RAAJYA-B…` each recruit (same or different spawners). | A's guards store A's ID, B's guards store B's ID — ownership follows the **stone**, not the nearby player or the spawner. Carrying two stones with different IDs shows a clear "conflicting"/"multiple stones" message and refuses to recruit. |

### Additional safety checks (recommended)
- Block all spawn space around the spawner → interacting shows "no safe, unoccupied space" and consumes nothing.
- Hold 2+ Commander Stones with **different** IDs → recruitment is refused with an ambiguity message (no silent assignment).
- Verify no purple/black "missing texture" visuals for the item, block, and entity, and that the guard renders with its geometry, texture and render controller in an idle standing pose.

## Offline validation that WAS run (all passing)

- `npm run typecheck` — strict TypeScript (`tsc --noEmit`), no errors.
- `npm test` — **21** unit tests of the exact production recruitment logic (`countItem`, `planConsume` exact-5-across-stacks consumption, ID generation/validation, ambiguous-stone resolution, end-to-end recruitment simulation).
- `npm run validate` — every JSON parsed; manifest UUIDs unique/valid + mutual BP↔RP link; `@minecraft/server` dependency matches the pinned npm version; custom identifiers consistent across BP/RP/lang/TS; 3×3 Diamond recipe (9 → 1); all assets present and **5 PNGs decode**; workflow/site paths consistent; `.mcpack` and `.mcaddon` archives structurally valid.
- `npm run build` — compiles/bundles a single ESM `scripts/main.js`, stages both packs with version injection, and packages `.mcpack` + `.mcaddon` + versioned copy + SHA-256 checksums; archive validation passes.
- `npm run site` — prepares the Pages artifact with placeholders resolved.

## Known limitations

- Real in-game behaviour (event firing, rendering, world-save persistence, multiplayer) **cannot** be proven without launching Minecraft.
- Target engine is **1.26.60** (matches `@minecraft/server` 2.11.0); older builds may refuse the pack or not load the script.
- Commander IDs are random 32-bit hex (collision astronomically unlikely, not cryptographically guaranteed).
- The `.mcaddon` bundles the two `.mcpack` files; the standalone `.mcpack` files are also provided for direct per-device import.
