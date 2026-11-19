# RAAJYA — Manual In-Game Test Checklist (v1.1.1)

> **Testing limitation (honest statement):** Minecraft Bedrock Edition **cannot be launched in the development environment** used to build this project. **No in-game test has been executed.** All offline validation that *can* run does pass (list at the bottom). This checklist must be performed by a human on Minecraft Bedrock **1.26.60+** after importing `dist/RAAJYA.mcaddon`. Enable the content log (Settings → Creator → *Enable Content Log*) to see any pack errors, and keep chat visible.

## Setup
1. Import `RAAJYA.mcaddon`; create a **Creative** world with **cheats ON**; activate **both** RAAJYA packs (they are linked). If you are updating over an older import, the packs share their UUIDs — the **v1.1.1** version replaces the old one.
2. No experiments/toggles are required on 1.26.60. (Tests B-7…B-13 exercise the station's deposit UI; on **1.26.60 stable** that UI needs the *Upcoming Creator Features* experiment — see the note in section B. On **1.26.70+** no toggle is needed.)
3. Useful commands:
   ```
   /give @s raajya:commander_stone
   /give @s raajya:royal_soldier_spawner
   /give @s minecraft:diamond_block 9
   /give @s minecraft:emerald_block 64
   ```
   (A "Spawn Royal Guard" egg also exists for inspecting the model — egg-spawned guards are bare by design.)

## Zero — registration (the v1.1.1 fix; must be clean)
| # | Test | Expected |
|---|---|---|
| 0a | Import the pack and load the world with the content log open | **No content-log errors**: no *“Failed to parse field '-> description -> menu_category -> group'”*, no *“Missing icon for data-driven item 'raajya:commander_stone'”*, no *“block … does not exist in the registry”*, no recipe errors. |
| 0b | Open the Creative inventory → **Items** tab | The Commander Stone sits in a new expandable **“RAAJYA Commander”** group (its own icon). |
| 0c | Open the Creative inventory → **Construction** tab | The Royal Soldier Spawner sits in a new expandable **“RAAJYA Stations”** group (its own icon). |

## A. Commander Stone
| # | Test | Expected |
|---|---|---|
| 1 | `/give @s raajya:commander_stone 1` | Exactly **one** stone with the **royal gem icon** (gold rim, blue faceted stone, crown sigil); `/give … 2` leaves two separate slots (**stack size 1**). |
| 2 | Hover the stone after any station/command use | Lore shows `Commander ID: RAAJYA-XXXXXXXX`. |
| 3 | Move it between slots; save, quit, reload | **Same ID** each time. |

## B. Royal Soldier Spawner (station)
| # | Test | Expected |
|---|---|---|
| 4 | Crafting table: 9 Diamond Blocks in **all 9 slots** | Produces **1** station (not an egg); 9 blocks consumed. This is the registration test for the recipe errors. |
| 5 | `/give @s raajya:royal_soldier_spawner 1` | Gives the **placeable station block** (not an egg); place it anywhere. |
| 6 | Break the placed station | It drops **itself** (loot table) and can be re-placed. |

> **Deposit UI (tests 7–13):** the station's container UI is provided by the `container` field of `minecraft:block_entity`, which on **1.26.60 stable** still requires the **Upcoming Creator Features** experiment (Mojang releases it for everyone in **1.26.70**). v1.1.1 keeps the block definition experiment-free, so on a stock 1.26.60 world the station is a registered, craftable, textured block whose deposit UI is dormant (recruitment code re-activates unchanged when the container returns). To run tests 7–13 **today**, enable *Settings → World → Experiments → Upcoming Creator Features* on 1.26.60, or test on any **1.26.70+** engine where the field is stable.

| # | Test | Expected |
|---|---|---|
| 7 | Interact (use) the placed station (container available) | The **station container UI opens** ("Royal Soldier Spawner", 9 slots); chat/action bar shows stored/progress/recruited/radius. |
| 8 | Put **< 5** Emerald Blocks in, close | Status line reports them stored; **no soldier**, nothing consumed. |
| 9 | Put Emerald Blocks in totalling **≥ 5** (try 13, split across slots) **while holding your Commander Stone**, close | **2 soldiers** spawn nearby (within 4 blocks), each visibly equipped; **10 blocks consumed**, **3 remain stored**; success message + updated status. |
| 10 | Reopen the station | The 3 remaining blocks are still there; take them back out any time (withdrawal works). |
| 11 | Deposit ≥ 5 blocks **without** any Commander Stone, close | "A Commander Stone is required…" — blocks **remain stored**, nothing consumed. |
| 12 | Drop your Commander Stone **into the station UI**, close | The stone is **ejected back** to you ("never deposited or consumed"); recruitment still processes the emeralds. |
| 13 | Box the station in completely and repeat 9 | "no safe, unoccupied space" — nothing consumed. |
| 14 | Try to break a station holding items | Break is **refused** ("Withdraw all items…"); empty station breaks normally and drops itself. |
| 15 | `/scriptevent raajya:cs radius 6` then repeat 9 | Soldiers spawn within ~6 blocks; status shows the new radius. |

## C. Royal Guard (equipment & AI)
| # | Test | Expected |
|---|---|---|
| 16 | Look at a recruited guard | **Netherite sword in hand, shield in offhand, full diamond armor** (visible), enchanted glints; walks with animated legs/arms, head tracks you. |
| 17 | Spawn a zombie/skeleton nearby (or `/summon zombie`) in **defend/attack** mode | Guards **pathfind to it and kill it** with melee swings — no teleporting. |
| 18 | Attack a guard yourself | Guards do **not** retaliate against you (players are excluded from all targeting). |
| 19 | Have guards fight near another guard | No friendly-fire retaliation loops (guards exclude the `royal_guard` family). |
| 20 | Save, quit, reload the world | Guards still exist, still **wear their equipment**, still obey commands, IDs unchanged. |

## D. Commands (`/scriptevent raajya:cs …`)
| # | Test | Expected |
|---|---|---|
| 21 | `status` | "You command N Royal Guards under RAAJYA-…", grouped by mode. |
| 22 | `follow` | Guards **walk after you** (pathfinding) and stop within ~3 blocks. |
| 23 | `here` | Guards march to you; once within ~3 blocks they **stop and hold**. |
| 24 | `defend` | Guards stay near you; hostiles that attack you (or that you attack) get intercepted and killed. |
| 25 | `attack` | Guards roam/hunt hostiles in a wide radius. |
| 26 | `patrol` | Guards wander the area and engage hostiles they meet. |
| 27 | `stop` | Guards stand fast everywhere. |
| 28 | Run a command **without** a Commander Stone | Clear "you command no Royal Guards" feedback; nothing changes. |

## E. Multiplayer / ownership
| # | Test | Expected |
|---|---|---|
| 29 | Player B (own stone) runs `status`/commands while A's guards are nearby | B's commands affect **only B's guards**; A's army ignores them. |
| 30 | B recruits at A's station with B's stone | B's guards store **B's** Commander ID; ownership is from the stone, never the station or proximity. |
| 31 | B tries to break into A's flow: deposit with no stone, etc. | Same safe refusals as solo play. |

## Automated validation that WAS run (all passing)
- `npm run typecheck` — strict TypeScript (`tsc --noEmit`).
- `npm test` — **28** unit tests: exact-5-across-stacks consumption, station economy (`recruitableCount`, remainder preservation, no-stone refusal), Commander ID generation/validation/ambiguity rules, mode validation, radius clamping, command parsing.
- `npm run validate` — every JSON parsed; manifest UUIDs unique/valid + mutual BP↔RP link + pinned `@minecraft/server` 2.11.0; **namespaced creative groups** on both definitions and full **item-catalog** cross-checks (groups defined, iconed, localized, listing our entries); **stable station block entity** (`minecraft:block_entity` with `dynamic_properties`, and a guard *forbidding* the experiment-gated `container` on the 1.26.60 target); **root-cause guards** (no colon atlas shortnames, no script custom components in block JSON); guard AI checks (navigation/melee/persistent/tameable/follow_owner without teleport/mode events/player-excluded targeting); client entity (`enable_attachables`, vanilla humanoid animations); geometry bone set (`rightItem`/`leftItem`/`hat`…); 3×3 diamond recipe; all 14 required assets present and **5 PNGs decode**; workflow/site consistency; `.mcpack`/`.mcaddon` structure.
- `npm run build` — bundles a single ESM `scripts/main.js` (verified to contain equipment/commands/station logic), stages both packs (version injected), packages + verifies archives, writes SHA-256 checksums.

## Not provable offline (must be checked in-game)
Container UI opening, equipment rendering on the model, pathfinding quality, animation playback, persistence across real world saves, multiplayer behaviour, and the container open/close event delivery are engine behaviours — tests 0a–31 above cover them.
