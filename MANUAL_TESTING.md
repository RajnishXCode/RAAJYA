# RAAJYA — Manual In-Game Test Checklist (v1.1.3)

> **Testing limitation (honest statement):** Minecraft Bedrock Edition **cannot be launched in the development environment** used to build this project. **No in-game test has been executed.** All offline validation that *can* run does pass (list at the bottom). This checklist must be performed by a human on Minecraft Bedrock **1.26.60+** after importing `dist/RAAJYA.mcaddon`. Enable the content log (Settings → Creator → *Enable Content Log*) to see any pack errors, and keep chat visible.

## Setup
1. Import `RAAJYA.mcaddon`; create a **Creative** world with **cheats ON**; activate **both** RAAJYA packs (they are linked). If you are updating over an older import, the packs share their UUIDs — the **v1.1.3** version replaces the old one.
2. No experiments/toggles are required on 1.26.60 for anything in this checklist — including station recruitment (interaction is script-driven since v1.1.2) and guard gear (data-driven since v1.1.3).
3. Useful commands:
   ```
   /give @s raajya:commander_stone
   /give @s raajya:royal_soldier_spawner
   /give @s minecraft:diamond_block 9
   /give @s minecraft:emerald_block 64
   ```
   (A "Spawn Royal Guard" egg also exists for inspecting the model — egg-spawned guards carry the standard data-driven gear but have no commander, by design.)

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
| 7 | Interact (use/tap) the placed station while carrying **13 Emerald Blocks** and your Commander Stone | **2 soldiers** spawn nearby (within 4 blocks), each visibly equipped; **10 Emerald Blocks leave your inventory** (3 remain); success message + status line (chat + action bar). |
| 8 | Interact while carrying **< 5** Emerald Blocks | Status line reports what you carry (`N/5 to next soldier`); **no soldier**, nothing consumed. |
| 9 | Interact with ≥ 5 Emerald Blocks **without** any Commander Stone | "A Commander Stone in your inventory is required…" — nothing consumed. |
| 10 | Hold the use button down on the station | Only **one** recruitment per press (held-button repeats are ignored). |
| 11 | Box the station in completely and repeat 7 | "no safe, unoccupied space" — nothing consumed. |
| 12 | `/scriptevent raajya:cs radius 6` then repeat 7 | Soldiers spawn within ~6 blocks; status shows the new radius. |

## C. Royal Guard (equipment & AI)
| # | Test | Expected |
|---|---|---|
| 13 | Look at a recruited guard | **Netherite sword in hand**, **royal plate uniform** (gold helmet with crest, shoulder plates, gold cuffs/boots) and — where the engine applies the gear table's armor set — **full diamond armor**; walks with animated legs/arms, head tracks you. |
| 14 | Spawn a zombie/skeleton nearby (or `/summon zombie`) in **defend/attack** mode | Guards **pathfind to it and kill it** with melee swings — no teleporting. |
| 15 | Attack a guard yourself | Guards do **not** retaliate against you (players are excluded from all targeting). |
| 16 | Have guards fight near another guard | No friendly-fire retaliation loops (guards exclude the `royal_guard` family). |
| 17 | Save, quit, reload the world | Guards still exist, still **wear their equipment**, still obey commands, IDs unchanged. |

## D. Commands (`/scriptevent raajya:cs …`)
| # | Test | Expected |
|---|---|---|
| 18 | `status` | "You command N Royal Guards under RAAJYA-…", grouped by mode. |
| 19 | `follow` | Guards **walk after you** (pathfinding) and stop within ~3 blocks. |
| 20 | `here` | Guards march to you; once within ~3 blocks they **stop and hold**. |
| 21 | `defend` | Guards stay near you; hostiles that attack you (or that you attack) get intercepted and killed. |
| 22 | `attack` | Guards roam/hunt hostiles in a wide radius. |
| 23 | `patrol` | Guards wander the area and engage hostiles they meet. |
| 24 | `stop` | Guards stand fast everywhere. |
| 25 | Run a command **without** a Commander Stone | Clear "you command no Royal Guards" feedback; nothing changes. |

## E. Multiplayer / ownership
| # | Test | Expected |
|---|---|---|
| 26 | Player B (own stone) runs `status`/commands while A's guards are nearby | B's commands affect **only B's guards**; A's army ignores them. |
| 27 | B recruits at A's station with B's stone | B's guards store **B's** Commander ID; ownership is from the stone, never the station or proximity. |
| 28 | B tries to break into A's flow: recruit with no stone, etc. | Same safe refusals as solo play. |

## Automated validation that WAS run (all passing)
- `npm run typecheck` — strict TypeScript (`tsc --noEmit`).
- `npm test` — **28** unit tests: exact-5-across-stacks consumption, station economy (`recruitableCount`, remainder preservation, no-stone refusal), Commander ID generation/validation/ambiguity rules, mode validation, radius clamping, command parsing.
- `npm run validate` — every JSON parsed; manifest UUIDs unique/valid + mutual BP↔RP link + pinned `@minecraft/server` 2.11.0; **namespaced creative groups** on both definitions and full **item-catalog** cross-checks (groups defined, iconed, localized, listing our entries); **stable station block entity** (`minecraft:block_entity` with `dynamic_properties`, and a guard *forbidding* the experiment-gated `container` on the 1.26.60 target); **root-cause guards** (no colon atlas shortnames, no script custom components in block JSON); guard AI checks (navigation/melee/persistent/tameable/follow_owner without teleport/mode events/player-excluded targeting); **data-driven guard gear** (`minecraft:equipment` table with sword + full diamond armor set — the root-cause guard for the v1.1.3 "no equippable component" rollback); client entity (`enable_attachables`, vanilla humanoid animations); geometry bone set (`rightItem`/`leftItem`/`hat`…); 3×3 diamond recipe; all 14 required assets present and **5 PNGs decode**; workflow/site consistency; `.mcpack`/`.mcaddon` structure **with the shipped `scripts/main.js` verified to wire `playerInteractWithBlock` (station interaction) and `scriptEventReceive` (commands)**.
- `npm run build` — bundles a single ESM `scripts/main.js` (verified to contain equipment/commands/station logic), stages both packs (version injected), packages + verifies archives, writes SHA-256 checksums.

## Not provable offline (must be checked in-game)
Container open/close event delivery (the dormant container path), equipment rendering on the model, pathfinding quality, animation playback, persistence across real world saves, multiplayer behaviour, and the interaction (`playerInteractWithBlock`) event delivery are engine behaviours — tests 0a–28 above cover them.
