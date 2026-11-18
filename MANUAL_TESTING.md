# RAAJYA — Manual In-Game Test Checklist (v1.1.0)

> **Testing limitation (honest statement):** Minecraft Bedrock Edition **cannot be launched in the development environment** used to build this project. **No in-game test has been executed.** All offline validation that *can* run does pass (list at the bottom). This checklist must be performed by a human on Minecraft Bedrock **1.26.60+** after importing `dist/RAAJYA.mcaddon`. Enable the content log (Settings → Creator → *Enable Content Log*) to see any pack errors, and keep chat visible.

## Setup
1. Import `RAAJYA.mcaddon`; create a **Creative** world with **cheats ON**; activate **both** RAAJYA packs (they are linked).
2. No experiments/toggles are required on 1.26.60.
3. Useful commands:
   ```
   /give @s raajya:commander_stone
   /give @s raajya:royal_soldier_spawner
   /give @s minecraft:diamond_block 9
   /give @s minecraft:emerald_block 64
   ```
   (A "Spawn Royal Guard" egg also exists for inspecting the model — egg-spawned guards are bare by design.)

## A. Commander Stone
| # | Test | Expected |
|---|---|---|
| 1 | `/give @s raajya:commander_stone 1` | Exactly **one** stone with the **royal gem icon** (gold rim, blue faceted stone, crown sigil); `/give … 2` leaves two separate slots (**stack size 1**). |
| 2 | Hover the stone after any station/command use | Lore shows `Commander ID: RAAJYA-XXXXXXXX`. |
| 3 | Move it between slots; save, quit, reload | **Same ID** each time. |

## B. Royal Soldier Spawner (station)
| # | Test | Expected |
|---|---|---|
| 4 | Crafting table: 9 Diamond Blocks in **all 9 slots** | Produces **1** station; 9 blocks consumed. |
| 5 | `/give @s raajya:royal_soldier_spawner 1` | Gives the **placeable station block** (not an egg); place it anywhere. |
| 6 | Interact (use) the placed station | The **station container UI opens** ("Royal Soldier Spawner", 9 slots); chat/action bar shows stored/progress/recruited/radius. |
| 7 | Put **< 5** Emerald Blocks in, close | Status line reports them stored; **no soldier**, nothing consumed. |
| 8 | Put Emerald Blocks in totalling **≥ 5** (try 13, split across slots) **while holding your Commander Stone**, close | **2 soldiers** spawn nearby (within 4 blocks), each visibly equipped; **10 blocks consumed**, **3 remain stored**; success message + updated status. |
| 9 | Reopen the station | The 3 remaining blocks are still there; take them back out any time (withdrawal works). |
| 10 | Deposit ≥ 5 blocks **without** any Commander Stone, close | "A Commander Stone is required…" — blocks **remain stored**, nothing consumed. |
| 11 | Drop your Commander Stone **into the station UI**, close | The stone is **ejected back** to you ("never deposited or consumed"); recruitment still processes the emeralds. |
| 12 | Box the station in completely and repeat 8 | "no safe, unoccupied space" — nothing consumed. |
| 13 | Try to break a station holding items | Break is **refused** ("Withdraw all items…"); empty station breaks normally and drops itself. |
| 14 | `/scriptevent raajya:cs radius 6` then repeat 8 | Soldiers spawn within ~6 blocks; status shows the new radius. |

## C. Royal Guard (equipment & AI)
| # | Test | Expected |
|---|---|---|
| 15 | Look at a recruited guard | **Netherite sword in hand, shield in offhand, full diamond armor** (visible), enchanted glints; walks with animated legs/arms, head tracks you. |
| 16 | Spawn a zombie/skeleton nearby (or `/summon zombie`) in **defend/attack** mode | Guards **pathfind to it and kill it** with melee swings — no teleporting. |
| 17 | Attack a guard yourself | Guards do **not** retaliate against you (players are excluded from all targeting). |
| 18 | Have guards fight near another guard | No friendly-fire retaliation loops (guards exclude the `royal_guard` family). |
| 19 | Save, quit, reload the world | Guards still exist, still **wear their equipment**, still obey commands, IDs unchanged. |

## D. Commands (`/scriptevent raajya:cs …`)
| # | Test | Expected |
|---|---|---|
| 20 | `status` | "You command N Royal Guards under RAAJYA-…", grouped by mode. |
| 21 | `follow` | Guards **walk after you** (pathfinding) and stop within ~3 blocks. |
| 22 | `here` | Guards march to you; once within ~3 blocks they **stop and hold**. |
| 23 | `defend` | Guards stay near you; hostiles that attack you (or that you attack) get intercepted and killed. |
| 24 | `attack` | Guards roam/hunt hostiles in a wide radius. |
| 25 | `patrol` | Guards wander the area and engage hostiles they meet. |
| 26 | `stop` | Guards stand fast everywhere. |
| 27 | Run a command **without** a Commander Stone | Clear "you command no Royal Guards" feedback; nothing changes. |

## E. Multiplayer / ownership
| # | Test | Expected |
|---|---|---|
| 28 | Player B (own stone) runs `status`/commands while A's guards are nearby | B's commands affect **only B's guards**; A's army ignores them. |
| 29 | B recruits at A's station with B's stone | B's guards store **B's** Commander ID; ownership is from the stone, never the station or proximity. |
| 30 | B tries to break into A's flow: deposit with no stone, etc. | Same safe refusals as solo play. |

## Automated validation that WAS run (all passing)
- `npm run typecheck` — strict TypeScript (`tsc --noEmit`).
- `npm test` — **28** unit tests: exact-5-across-stacks consumption, station economy (`recruitableCount`, remainder preservation, no-stone refusal), Commander ID generation/validation/ambiguity rules, mode validation, radius clamping, command parsing.
- `npm run validate` — every JSON parsed; manifest UUIDs unique/valid + mutual BP↔RP link + pinned `@minecraft/server` 2.11.0; **station container** (`minecraft:block_entity` with `dynamic_properties` + 9-slot `container` + `show_ui_on_interaction`); **root-cause guards** (no colon atlas shortnames, no script custom components in block JSON); guard AI checks (navigation/melee/persistent/tameable/follow_owner without teleport/mode events/player-excluded targeting); client entity (`enable_attachables`, vanilla humanoid animations); geometry bone set (`rightItem`/`leftItem`/`hat`…); 3×3 diamond recipe; all 14 required assets present and **5 PNGs decode**; workflow/site consistency; `.mcpack`/`.mcaddon` structure.
- `npm run build` — bundles a single ESM `scripts/main.js` (verified to contain equipment/commands/station logic), stages both packs (version injected), packages + verifies archives, writes SHA-256 checksums.

## Not provable offline (must be checked in-game)
Container UI opening, equipment rendering on the model, pathfinding quality, animation playback, persistence across real world saves, multiplayer behaviour, and the container open/close event delivery are engine behaviours — items 1–30 above cover them.
