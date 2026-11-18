# RAAJYA — Minecraft Bedrock Add-on

RAAJYA is a production-quality, modular Minecraft Bedrock Edition add-on built around a **Commander Stone**, a **Royal Soldier Spawner** recruitment station with a real container UI, and fully-equipped **Royal Guard** soldiers with data-driven AI and a `/scriptevent` command system.

> Scope: recruitment, ownership, equipment and soldier control. There is **no** Barracks, no vanilla-entity modification, no player-vs-player aggression (guards never target players).

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

**No preview/beta APIs are used.** No world experiment toggles are required on the target engine. Block/entity/item JSON uses format versions verified against current official samples (`1.26.40` block, `1.26.20` entity, `1.21.80` item) and vanilla component shapes from `Mojang/bedrock-samples` at 1.26.x.

### Custom-block inventory — the actual stable API
Researched and verified: there is **no** `minecraft:inventory` block component. The stable API for custom-block containers is the **`minecraft:block_entity`** component (with a nested `container`: `slot_count` 1–54, `title`, `show_ui_on_interaction`) — this is what RAAJYA's station uses. The script-side `VirtualContainer` custom-UI API is **preview-only** and is deliberately not used.

### Verified stable Script APIs used
`system.afterEvents.scriptEventReceive`, `world.afterEvents.blockContainerOpened` / `blockContainerClosed` (both carry the accessing player), `BlockInventoryComponent`, `BlockDynamicPropertiesComponent`, `EntityEquippableComponent.setEquipment`, `ItemEnchantableComponent.addEnchantments`, `EnchantmentTypes`, `EntityTameableComponent.tame/tamedToPlayer`, `Entity.triggerEvent`, `world.afterEvents.entityLoad`, `world.beforeEvents.playerBreakBlock` (+`system.run` deferral), `Dimension.getEntities/spawnEntity/getBlock`, `system.runInterval/runTimeout`, `player.sendMessage/onScreenDisplay.setActionBar`, `ItemStack/Entity/Block` dynamic properties, `Container` operations. Movement/AI is **data-driven** (vanilla behaviors) — there is no stable scripted pathfinding API, so no teleportation is used anywhere.

---

## 2. Project structure

```
behavior_pack/
├── manifest.json                       # BP header, data + script modules, deps
├── items/commander_stone.json          # non-stackable, Creative, icon fix
├── blocks/royal_soldier_spawner.json   # station: geometry + material_instances
│                                       #   + minecraft:block_entity container
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
│   │   ├── index.ts                    # container open/close wiring + cooldown
│   │   ├── station.ts                  # storage, status, deposit processing
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
- **Never deposited or consumed**: if a player drops a stone into the station UI it is automatically ejected back on close.

## 4. Royal Soldier Spawner — a real recruitment station

`raajya:royal_soldier_spawner` is a placeable, reusable custom block with its own geometry/texture, craftable from **9 Diamond Blocks in the full 3×3 grid**, and `/give @s raajya:royal_soldier_spawner 1` gives the placeable station.

**It has a real inventory**: `minecraft:block_entity` declares a 9-slot **container** titled "Royal Soldier Spawner" whose UI **opens on interaction** (the stable custom-block inventory API), plus per-instance dynamic properties.

- **Deposit**: open the station and put Emerald Blocks in (any amount, any stack split).
- **Recruit**: when a player closes the station, every **5 stored Emerald Blocks recruit exactly one soldier** — spawned at a safe position within the configurable radius (default **4 blocks**), each consuming exactly 5 blocks from the station's container.
- **Requires** the closing player to hold a valid Commander Stone; without one the emeralds remain safely stored with a clear message.
- **Status**: opening the station shows `stored / next-soldier progress / recruited here / spawn radius` (chat + action bar); the emeralds are visible in the UI itself.
- **Preservation**: failed recruitment or no safe spawn leaves stored blocks untouched; breaking a station that still holds items is refused (`Withdraw all items…`); take items back out any time.
- **Radius config**: `/scriptevent raajya:cs radius <1-16>` (stored on the world, default 4).

## 5. Royal Guard — fully equipped soldiers

`raajya:royal_guard` is a separate custom humanoid entity (never a modified villager). **Recruited** guards receive — applied from script to the real equipment slots, visibly rendered (`enable_attachables` + vanilla humanoid bone names so vanilla armor attachables bind):

- **Netherite sword** (Mainhand) — Sharpness III + Unbreaking III
- **Shield** (Offhand)
- **Diamond helmet/chestplate/leggings/boots** — Protection III + Unbreaking III

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
npm run validate     # JSON, manifests/UUIDs, identifiers, station container,
                     #   guard AI/equipment, recipe, PNG decode, workflow, archives
npm run build        # steps 1–7 → dist/RAAJYA.mcaddon (+ versioned copy)
npm run package      # steps 6–7 only
npm run site         # GitHub Pages artifact
npm run textures     # regenerate original pixel-art PNGs
npm run ci           # typecheck + test + validate + build
```

Outputs in `dist/` (gitignored): `RAAJYA.mcaddon` (latest), `RAAJYA-v1.1.0.mcaddon`, `RAAJYA_BP.mcpack`, `RAAJYA_RP.mcpack`, `SHA256SUMS.txt`, `_site/`. The `.mcaddon` is a genuine ZIP of the two `.mcpack` files, each with `manifest.json` at the archive root and both packs linked by mutual manifest UUID dependencies.

## 8–9. CI/CD, Pages, Git

Unchanged from the initial version — see the workflow (`.github/workflows/deploy.yml`, official Pages actions, `push: main` + `workflow_dispatch`, `dist/_site` artifact) and §7–9 of the git history. Downloads: `https://<OWNER>.github.io/<REPO>/RAAJYA.mcaddon` (always latest) and `RAAJYA-v1.1.0.mcaddon`, plus the standalone `.mcpack` files and `SHA256SUMS.txt`. Nothing is pushed or remoted without approval.

---

## Root causes fixed in v1.1.0

1. **Commander Stone missing icon** — the item-atlas shortname contained a **colon** (`raajya:commander_stone`); atlas shortnames must be colon-free. Renamed to `raajya_commander_stone` in both `item_texture.json` and `minecraft:icon`, with validation now enforcing colon-free shortnames. The icon was also redrawn as a recognizable royal gem.
2. **Spawner item missing (only a spawn egg existed)** — the block JSON referenced a **script-registered custom component** (`raajya:spawner_interact`), coupling block loading to script health: if the script module doesn't load, the block definition fails to parse and no block item is registered. The block JSON now contains **no script custom components** (a validation guard enforces this), uses its **own RP geometry** (`geometry.raajya.royal_soldier_spawner`) instead of an engine-provided reference, and interaction works through the stable global container/open-close events instead.
3. **Non-functional soldiers** — the entity was a bare idle mob with no equipment or AI (deliberately out of the original phase's scope). Now fully implemented: script-applied enchanted equipment with visible rendering, data-driven vanilla AI, mode component groups, tame-based ownership for real pathfinding, and the full command system.

## Known limitations & honesty

- **In-game verification is manual.** Everything checkable offline passes (strict TS, 28 unit tests, full validation suite, archive verification), but Minecraft cannot be launched here — see **[MANUAL_TESTING.md](MANUAL_TESTING.md)** for the required in-game checklist and what each automated check does and does not prove.
- **Target engine = 1.26.60** (`@minecraft/server` 2.11.0 / `min_engine_version` [1,26,60]). Older builds may refuse the pack or not load the script module.
- Guards recruited **through the spawn egg** (dev/testing only) are bare and stand at ease — equipment and modes are granted by the recruitment flow, not by the egg.
- Hopper-fed deposits do not auto-recruit (no player close event); any stone-holding player opening+closing the station processes them.
- The station refuses to break while holding items (resources preserved) rather than risking engine drop behaviour.
- Commander IDs are random 32-bit hex (collision astronomically unlikely, not cryptographic).

## License

MIT — see [LICENSE](LICENSE).
