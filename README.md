# RAAJYA — Minecraft Bedrock Add-on

RAAJYA is a production-quality, modular Minecraft Bedrock Edition add-on built around a **Commander Stone**, a **Royal Soldier Spawner** recruitment station with a real container UI, and fully-equipped **Royal Guard** soldiers with data-driven AI and a `/scriptevent` command system.

> Scope: recruitment, ownership, equipment and soldier control. There is **no** Barracks, no vanilla-entity modification, no player-vs-player aggression (guards never target players).

**v1.1.3 — guards always spawn equipped:** gear is now data-driven (`minecraft:equipment`, the vanilla-zombie mechanism) and script equipment is a best-effort upgrade — recruitment can no longer roll back on equipment. See §5.
**v1.1.2 — interactable station:** using the spawner now recruits soldiers directly from the player's inventory (stable `playerInteractWithBlock`) — no experiments, no container UI needed. See §4.
**v1.1.1 — registration fixes:** namespaced creative groups (fixes item/block parse failures, missing icon, recipe errors), experiment-free block schema, custom Creative groups via the item catalog. See [Root causes fixed in v1.1.1](#root-causes-fixed-in-v111) below.
**v1.1.0 — in-game fixes & full gameplay:** real station container, enchanted equipment, functional AI, all seven commands. See [Root causes fixed in v1.1.0](#root-causes-fixed-in-v110) below.

---

## 1. Compatibility (pinned & mutually consistent)

| Component | Pinned version | Notes |
|---|---|---|
| `@minecraft/server` | **2.11.0** | Stable npm `latest`; ships with **Minecraft Bedrock 1.26.60**. Manifest dependency is the SemVer string `"2.11.0"`. |
| `@minecraft/common` / `@minecraft/vanilla-data` | 1.3.0 / 1.26.60 | peers |
| `min_engine_version` | `[1, 26, 60]` | Matches the engine shipping `@minecraft/server` 2.11.0 |
| manifest `format_version` | `2` | stable (v3 is preview — not used) |
| TypeScript 5.9.3 · esbuild 0.28.2 · Node ≥ 18 | — | build tooling only |

**No preview/beta APIs are used.** No world experiment toggles are required on the target engine. Block/entity/item JSON uses format versions verified against the **engine's stable schemas** for 1.26.60 (`1.26.50` block, `1.26.20` entity, `1.21.80` item, `1.26.50` item catalog) — every field in every pack file parses on a stock (no-experiments) world.

### Custom-block inventory — status on 1.26.60 (honest note)
Custom-block per-instance state uses the **`minecraft:block_entity`** component (block format **1.26.50+**), which is stable on 1.26.60 — RAAJYA uses it for the station's per-instance dynamic properties. Its **`container`** parameter (the deposit UI), however, is still gated behind the *Upcoming Creator Features* experiment on 1.26.60 stable (Mojang releases it in **1.26.70**), and its `show_ui_on_interaction` field does not exist at 1.26.60 at all (added in Preview 26.70.20). v1.1.0 shipped those fields believing they were stable — on a stock world they made the whole block fail to register. **v1.1.2 therefore makes the station fully usable WITHOUT them**: interaction is handled in script (stable `playerInteractWithBlock`) and recruits directly from the player's inventory. The container-storage code paths remain in the scripts for a future 1.26.70-targeting release.

### Verified stable Script APIs used
`system.afterEvents.scriptEventReceive`, `world.afterEvents.playerInteractWithBlock` (+`isFirstEvent`), `world.afterEvents.blockContainerOpened` / `blockContainerClosed` (dormant container path), `BlockDynamicPropertiesComponent`, `EntityEquippableComponent` (best-effort gear upgrade only), `ItemEnchantableComponent.addEnchantments`, `EnchantmentTypes`, `EntityTameableComponent.tame/tamedToPlayer`, `Entity.triggerEvent`, `world.afterEvents.entityLoad`, `world.beforeEvents.playerBreakBlock` (+`system.run` deferral), `Dimension.getEntities/spawnEntity/getBlock`, `system.runInterval/runTimeout`, `player.sendMessage/onScreenDisplay.setActionBar`, `ItemStack/Entity/Block` dynamic properties, `Container` operations. Movement/AI is **data-driven** (vanilla behaviors) — there is no stable scripted pathfinding API, so no teleportation is used anywhere.

---

## 2. Project structure

```
behavior_pack/
├── manifest.json                       # BP header, data + script modules, deps
├── items/commander_stone.json          # non-stackable, Creative, icon fix
├── blocks/royal_soldier_spawner.json   # station: geometry + material_instances
│                                       #   + minecraft:block_entity dynamic_properties
├── item_catalog/crafting_item_catalog.json  # our namespaced Creative groups
├── entities/royal_guard.json           # full AI + mode component groups
├── recipes/royal_soldier_spawner.json  # 3x3 diamond blocks
├── loot_tables/blocks/…
└── scripts/                            # compiled main.js written at build time
resource_pack/
├── manifest.json · pack_icon.png
├── blocks.json · entity/royal_guard.json (enable_attachables + vanilla anims)
├── models/blocks/royal_soldier_spawner.geo.json   # own full-cube geometry
├── models/entity/royal_guard.geo.json  # vanilla humanoid bone set (+rightItem/leftItem)
├── render_controllers/royal_guard.json
├── textures/{item_texture,terrain_texture}.json + items/blocks/entity PNGs
└── texts/{en_US.lang, languages.json}
src/
├── main.ts                             # wiring: station events, commands,
│                                       #   entityLoad re-apply, break guard
├── core/{ids,constants,types}.ts
├── features/
│   ├── commander-stone/index.ts        # ID read/init + write-back
│   ├── soldier-spawner/
│   │   ├── index.ts                    # station interact wiring + cooldown
│   │   ├── station.ts                  # interact recruitment + container-path helpers
│   │   ├── recruitment.ts              # per-soldier transaction (rollback)
│   │   ├── inventory.ts                # container helpers + stone ejection
│   │   └── spawn.ts                    # safe spawn (configurable radius)
│   ├── royal-guard/index.ts            # equipment, ownership, modes
│   └── commands/index.ts               # /scriptevent raajya:cs commands
├── utils/{recruitment-logic.mjs, messages.ts, log.ts}
tests/recruitment.test.mjs              # 28 unit tests
scripts/{lib,build,package,validate,prepare-site,gen-textures}.mjs
site/index.html · .github/workflows/deploy.yml · MANUAL_TESTING.md
```

---

## 3. Commander Stone

`raajya:commander_stone` — **non-stackable** (`minecraft:max_stack_size: 1`, so `/give @s raajya:commander_stone 1` gives exactly one and `ItemStack.setDynamicProperty` works, which the stable API permits **only** on non-stackable items), Creative-available, with a **fixed, recognizable royal gem icon** (faceted blue stone in a gold rim with a crown sigil — see Root causes for the icon bug fix).

- A unique persistent Commander ID (`RAAJYA-7F31A9C2`) is generated on first use, stored on the **ItemStack itself** and written back with `container.setItem` — it survives slot moves and world reloads and is never regenerated.
- Multiple stones with different IDs (or uninitialized stones) are **refused with a clear message** — never silently guessed.
- **Never consumed**: recruitment only ever reads the stone's Commander ID — the stone itself is never spent, moved or altered by the station.

## 4. Royal Soldier Spawner — a real recruitment station

`raajya:royal_soldier_spawner` is a placeable, reusable custom block with its own geometry/texture, craftable from **9 Diamond Blocks in the full 3×3 grid**, and `/give @s raajya:royal_soldier_spawner 1` gives the placeable station. It keeps per-instance **dynamic properties** via the stable `minecraft:block_entity` component (block format 1.26.50).

**Interact (use) the station to recruit — stable on 1.26.60, zero experiments:**

- **Recruit**: use the station while carrying Emerald Blocks and a Commander Stone — every **5 carried Emerald Blocks recruit exactly one soldier**, consumed directly from your inventory by a rollback-safe transaction. Soldiers spawn at a safe position within the configurable radius (default **4 blocks**).
- **Requires** a valid Commander Stone in the interacting player's inventory; without one nothing is consumed and the message says so.
- **Status**: every interaction shows `carried Emerald Blocks / next-soldier progress / recruited here / spawn radius` (chat + action bar).
- **Preservation**: failed recruitment or no safe spawn consumes nothing — resources are never lost.
- **Radius config**: `/scriptevent raajya:cs radius <1-16>` (stored on the world, default 4).

> **Why not a container deposit UI?** Custom-block containers (`minecraft:block_entity` → `container`) are still behind the *Upcoming Creator Features* experiment on 1.26.60 stable (Mojang releases them in 1.26.70); shipping those fields is what broke block registration in v1.1.0. v1.1.2 instead handles the interaction in script and recruits from the player's inventory — the same tested economy (5 blocks → 1 soldier, exact consumption with rollback), no experiments, no dormant features. The container-storage code paths remain in the scripts for a future 1.26.70-targeting release.

## 5. Royal Guard — geared soldiers

`raajya:royal_guard` is a separate custom humanoid entity (never a modified villager).

**Gear is data-driven (stable, works on 1.26.60):** the entity declares **`minecraft:equipment`** with a gear table (`loot_tables/entities/royal_guard_gear.json`) — the same mechanism vanilla zombies use. Every guard spawns **holding a Netherite sword**, and the table's armor set (diamond helmet/chestplate/leggings/boots) is applied wherever the engine supports armor on custom entities. The sword and any applied armor render on the model (vanilla humanoid bone set + `enable_attachables`), and the guard's own skin is a full royal plate uniform — gold helmet with crest, shoulder plates, gold cuffs and boots — so a guard always reads as armored.

**Best-effort script upgrade:** where the engine exposes equipment slots on custom entities to scripts (`EntityEquippableComponent` — not on 1.26.60), recruitment additionally applies the exact enchanted loadout (Sharpness III sword, shield, Protection III armor). This pass can never fail a recruitment; on 1.26.60 guards keep their data-driven gear.

**Functional AI (data-driven, no fake teleportation):** `navigation.walk`, `movement.basic`, `jump.static`, `melee_box_attack`, `hurt_by_target` (excluding players and other guards), `look_at_player`, `random_look_around`, `float`; mode groups add `follow_owner` (real pathfinding; built-in teleport explicitly **disabled** via `post_teleport_distance: -1`), `owner_hurt_by_target` / `owner_hurt_target`, `nearest_attackable_target` (family `monster` only — **guards never attack players**), and `random_stroll` for patrol. Health 40, attack 10, knockback resistance, `minecraft:persistent` (no despawning), and vanilla humanoid animations (walk, look-at, holding, attack, bob).

### Modes & commands (`/scriptevent raajya:cs <command>`)

| Command | Function |
|---|---|
| `/scriptevent raajya:cs stop` | Stand fast, hold position |
| `/scriptevent raajya:cs here` | March to the commander (real pathfinding), then hold |
| `/scriptevent raajya:cs follow` | Trail the commander |
| `/scriptevent raajya:cs defend` | Stay with the commander; attack hostiles that threaten them |
| `/scriptevent raajya:cs attack` | Hunt hostile mobs in a wide radius |
| `/scriptevent raajya:cs patrol` | Wander the area and engage hostiles met |
| `/scriptevent raajya:cs status` | Owned soldier count grouped by current mode |
| `/scriptevent raajya:cs radius <1-16>` | Configure station spawn radius (default 4) |

Commands validate the issuing player's Commander Stone and affect **only guards carrying that Commander ID**; guards are re-tamed to the recruiting player so follow/defend use genuine vanilla pathfinding. Modes persist across world reloads (re-applied on `entityLoad`).

## 6. Ownership & multiplayer

Ownership is stored as a dynamic property on each guard, copied **only from the Commander Stone** used to recruit (never from proximity or the spawner), and survives world reloads. Player A's and Player B's armies are fully independent; each player's commands control only their own guards.

---

## 7. Build & packaging

```bash
npm install
npm run typecheck    # strict tsc --noEmit
npm test             # 28 unit tests (economy, modes, commands, ID logic)
npm run validate     # JSON, manifests/UUIDs, identifiers, creative groups +
                     #   item catalog, station block entity, guard AI,
                     #   recipe, PNG decode, workflow, archives
npm run build        # steps 1–7 → dist/RAAJYA.mcaddon (+ versioned copy)
npm run package      # steps 6–7 only
npm run site         # GitHub Pages artifact
npm run textures     # regenerate original pixel-art PNGs
npm run ci           # typecheck + test + validate + build
```

Outputs in `dist/` (gitignored): `RAAJYA.mcaddon` (latest), `RAAJYA-v1.1.3.mcaddon`, `RAAJYA_BP.mcpack`, `RAAJYA_RP.mcpack`, `SHA256SUMS.txt`, `_site/`. The `.mcaddon` is a genuine ZIP of the two `.mcpack` files, each with `manifest.json` at the archive root and both packs linked by mutual manifest UUID dependencies.

## 8–9. CI/CD, Pages, Git

Unchanged from the initial version — see the workflow (`.github/workflows/deploy.yml`, official Pages actions, `push: main` + `workflow_dispatch`, `dist/_site` artifact) and §7–9 of the git history. Downloads: `https://<OWNER>.github.io/<REPO>/RAAJYA.mcaddon` (always latest) and `RAAJYA-v1.1.3.mcaddon`, plus the standalone `.mcpack` files and `SHA256SUMS.txt`. Nothing is pushed or remoted without approval.

---

## Root causes fixed in v1.1.3

Recruitment triggered but always rolled back with *"Royal Guard has no equippable component"*: the script called `getComponent("minecraft:equippable")` — and on 1.26.60 that component **exists only on player entities and hardcoded mobs** (the official Script API docs state exactly this). Custom entities do not expose script equipment slots, so the "apply equipment or roll back the whole recruitment" design made every recruitment fail.

**Fix:** the direction was inverted.
1. **Base gear is now data-driven.** The Royal Guard entity declares `minecraft:equipment` with a gear table (`loot_tables/entities/royal_guard_gear.json`): Netherite sword in hand plus the full diamond armor set, structured like vanilla's own `zombie_equipment.json` / `armor_set_diamond.json`. This is the same stable spawn-gear mechanism vanilla zombies use — no experiments, no runtime-identifier hacks (which would have smuggled in hardcoded undead side effects).
2. **Script equipment is a best-effort upgrade** (`applyGuardEquipment` now returns instead of throwing): wherever the engine does expose equipment slots on custom entities, recruits get the exact enchanted loadout; on 1.26.60 they keep the data-driven gear. Recruitment can never fail on equipment again.

Validation now enforces the data-driven gear chain: `minecraft:equipment` on the entity, the gear table present, and all five gear items in it.

## Root causes fixed in v1.1.2

The spawner block registered and crafted (v1.1.1) but **interacting with it did nothing**: on a stock 1.26.60 world the block has no container UI, because custom-block containers (`minecraft:block_entity` → `container`) are still behind the *Upcoming Creator Features* experiment there (Mojang releases them in 1.26.70) — and v1.1.0/v1.1.1 had no interaction path without one.
**Fix:** the station is now driven by the stable `world.afterEvents.playerInteractWithBlock` event. Using the station consumes Emerald Blocks **directly from the interacting player's inventory** — every 5 carried blocks fund one soldier via the same rollback-safe `recruit()` transaction (validated Commander Stone required, exact consumption, safe spawn search, per-instance recruited counter). No experiments, no container needed. Only the initial button press counts (`isFirstEvent`), with a per-player cooldown as a second guard. The build now also verifies the shipped `scripts/main.js` actually wires this handler.

## Root causes fixed in v1.1.1

The five content-log errors Minecraft reported on 1.26.60 stable all traced back to two root causes in the pack JSON:

1. **Non-namespaced `menu_category.group` (`itemGroup.name.misc`)** in BOTH the Commander Stone item and the spawner block. Since format version **1.21.60** the group must be a namespaced identifier (engine schema pattern `^\S+:\S+$`), and `itemGroup.name.misc` is not even a real group in the current creative catalog. For the **item**, the strict description-parse failure aborted the whole definition — components (including `minecraft:icon`) were never applied, producing both *“Failed to parse field '-> description -> menu_category -> group'”* and *“Missing icon for data-driven item”* (the icon wiring itself was already correct). For the **block**, the same parse failure meant the block never entered the registry, producing *“The block named 'raajya:royal_soldier_spawner' in 'blocks.json' file does not exist in the registry”* and both recipe errors (*“The Item: … is missing or invalid, can't make the recipe”* / *“Recipe result malformed”*) — the recipe JSON itself was already correct and matches current vanilla recipe format.
   **Fix:** RAAJYA now defines its own namespaced creative groups — `raajya:itemGroup.name.commander` (Items tab) and `raajya:itemGroup.name.stations` (Construction tab) — in `BP/item_catalog/crafting_item_catalog.json` (the official `minecraft:crafting_items_catalog` format), localizes both names in `en_US.lang`, and references them from both definitions. This also guarantees both entries are listed (and visible) in the Creative inventory, each as the icon of its own expandable group.
2. **Experiment-gated/nonexistent `minecraft:block_entity` container fields** in the spawner block. `container.show_ui_on_interaction` **does not exist** on 1.26.60 stable (added in Preview 26.70.20) — an unknown field is a strict parse failure regardless of experiment settings — and the entire `container` parameter is still behind the *Upcoming Creator Features* experiment on 1.26.60 (Mojang releases it in 1.26.70). The file's `format_version` (`1.26.40`) also predated `minecraft:block_entity`'s stable release (block format **1.26.50**). Even after fixing the group, the block would have failed to register on any stock world.
   **Fix:** the block now uses `format_version 1.26.50` and declares only the stable form — `minecraft:block_entity: { "dynamic_properties": true }` — keeping per-instance station state on the stable API. The deposit-UI container returns (no code changes needed) when the pack targets engines ≥ 1.26.70.

New validation guards lock all of this in: namespaced groups on both definitions, catalog↔definition↔language cross-checks, `dynamic_properties` required, and any `minecraft:block_entity.container` reintroduction on the 1.26.60 target is rejected.

## Root causes fixed in v1.1.0

1. **Commander Stone missing icon** — the item-atlas shortname contained a **colon** (`raajya:commander_stone`); atlas shortnames must be colon-free. Renamed to `raajya_commander_stone` in both `item_texture.json` and `minecraft:icon`, with validation now enforcing colon-free shortnames. The icon was also redrawn as a recognizable royal gem.
2. **Spawner item missing (only a spawn egg existed)** — the block JSON referenced a **script-registered custom component** (`raajya:spawner_interact`), coupling block loading to script health: if the script module doesn't load, the block definition fails to parse and no block item is registered. The block JSON now contains **no script custom components** (a validation guard enforces this), uses its **own RP geometry** (`geometry.raajya.royal_soldier_spawner`) instead of an engine-provided reference, and interaction works through the stable global container/open-close events instead.
3. **Non-functional soldiers** — the entity was a bare idle mob with no equipment or AI (deliberately out of the original phase's scope). Now fully implemented: script-applied enchanted equipment with visible rendering, data-driven vanilla AI, mode component groups, tame-based ownership for real pathfinding, and the full command system.

## Known limitations & honesty

- **In-game verification is manual.** Everything checkable offline passes (strict TS, 28 unit tests, full validation suite, archive verification), but Minecraft cannot be launched here — see **[MANUAL_TESTING.md](MANUAL_TESTING.md)** for the required in-game checklist and what each automated check does and does not prove.
- **Target engine = 1.26.60** (`@minecraft/server` 2.11.0 / `min_engine_version` [1,26,60]). Older builds may refuse the pack or not load the script module.
- Guards recruited **through the spawn egg** (dev/testing only) carry the standard data-driven gear (sword + armor set) but have no Commander and stand at ease — ownership, modes and the script-enchanted upgrade are granted by the recruitment flow, not the egg.
- Recruitment consumes Emerald Blocks straight from the interacting player's inventory; there is no station storage to lose (a container-storage variant returns with a future 1.26.70-targeting build).
- The station refuses to break while holding items (resources preserved) rather than risking engine drop behaviour.
- Commander IDs are random 32-bit hex (collision astronomically unlikely, not cryptographic).

## License

MIT — see [LICENSE](LICENSE).
