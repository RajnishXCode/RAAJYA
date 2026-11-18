# RAAJYA — Minecraft Bedrock Add-on

RAAJYA is a production-quality, modular Minecraft Bedrock Edition add-on built around a **Commander Stone**, a reusable **Royal Soldier Spawner** custom block, and a custom **Royal Guard** entity. This initial phase focuses on **reliable recruitment and persistent ownership**.

> Scope of this phase: recruitment + ownership data only. There is **no** Barracks, `/cs` command system, combat AI, patrol AI, or advanced soldier management. Vanilla villagers/entities are never modified.

---

## 1. Compatibility (pinned & mutually consistent)

This project targets the **current stable** Bedrock Script API. Versions were verified against the official Microsoft Learn docs, the `@minecraft/server` npm registry, and the installed 2.11.0 type definitions before implementation.

| Component | Pinned version | Notes |
|---|---|---|
| `@minecraft/server` | **2.11.0** | Stable npm `latest`; ships with **Minecraft Bedrock 1.26.60**. Used in the BP manifest `dependencies` as the SemVer string `"2.11.0"`. |
| `@minecraft/common` | 1.3.0 | peer of `@minecraft/server` |
| `@minecraft/vanilla-data` | 1.26.60 | peer; used for IDE typing only (runtime uses string constants) |
| `min_engine_version` | `[1, 26, 60]` | Matches the engine that ships `@minecraft/server` 2.11.0 |
| manifest `format_version` | `2` | stable (v3 is preview — not used) |
| TypeScript | 5.9.3 | strict, `--noEmit` typecheck |
| esbuild | 0.28.2 | bundles TS → a single ESM `scripts/main.js` |
| Node.js | ≥ 18 | build tooling only |

**No preview/beta APIs are used.** No `-beta` module versions. On the target engine (1.26.60) **no world experiment toggles are required** — custom items, custom blocks, custom entities and the *stable* Script API are all out of preview. (See [Known limitations](#12-known-limitations--honesty) for a caveat about older preview builds.)

### Verified stable APIs used
`ItemStack.setDynamicProperty` / `getDynamicProperty`, `Entity.setDynamicProperty` / `getDynamicProperty`, `system.beforeEvents.startup` + `blockComponentRegistry.registerCustomComponent`, `BlockComponentPlayerInteractEvent.onPlayerInteract`, `world.afterEvents.playerInteractWithBlock`, `Container.getItem` / `setItem` / `size`, `ItemStack.clone` / `setLore` / `amount`, `Dimension.spawnEntity` / `getBlock`, `Block.isAir` / `isLiquid`, `system.runTimeout`, `player.sendMessage`. The older V1 `world.beforeEvents.worldInitialize` and `minecraft:custom_components` array are **deprecated/absent in 2.x** and are deliberately not used.

---

## 2. Project structure

```
raajya-bedrock-addon/
├── behavior_pack/
│   ├── manifest.json                       # BP header, data + script modules, deps
│   ├── pack_icon.png
│   ├── items/commander_stone.json
│   ├── blocks/royal_soldier_spawner.json
│   ├── entities/royal_guard.json
│   ├── recipes/royal_soldier_spawner.json
│   ├── loot_tables/blocks/royal_soldier_spawner.json
│   └── scripts/                            # compiled main.js written here at build time (gitignored)
├── resource_pack/
│   ├── manifest.json                       # RP header + resources module, deps
│   ├── pack_icon.png
│   ├── blocks.json                         # spawner sound/texture shortname
│   ├── entity/royal_guard.json            # minecraft:client_entity
│   ├── models/entity/royal_guard.geo.json # humanoid geometry (64x64 UV)
│   ├── render_controllers/royal_guard.json
│   ├── textures/
│   │   ├── item_texture.json
│   │   ├── terrain_texture.json
│   │   ├── items/commander_stone.png
│   │   ├── blocks/royal_soldier_spawner.png
│   │   └── entity/royal_guard.png
│   └── texts/{en_US.lang, languages.json}
├── src/                                    # TypeScript Script API source (strict)
│   ├── main.ts                             # event wiring (startup + fallback)
│   ├── globals.d.ts
│   ├── core/{ids.ts, constants.ts, types.ts}
│   ├── features/
│   │   ├── commander-stone/index.ts       # ID read/init + write-back
│   │   ├── soldier-spawner/
│   │   │   ├── index.ts                   # cooldown + messages (event-facing)
│   │   │   ├── recruitment.ts             # the atomic transaction
│   │   │   ├── inventory.ts               # Container <-> snapshot + consumption/rollback
│   │   │   └── spawn.ts                   # safe spawn search
│   │   └── royal-guard/index.ts           # ownership persistence
│   └── utils/{recruitment-logic.mjs, messages.ts, log.ts}
├── scripts/
│   ├── lib.mjs             # shared build/validate/package helpers
│   ├── build.mjs           # steps 1–5
│   ├── package.mjs         # steps 6–7
│   ├── validate.mjs        # full validation suite
│   ├── prepare-site.mjs    # GitHub Pages artifact
│   └── gen-textures.mjs    # reproducible original pixel-art PNGs
├── tests/recruitment.test.mjs            # 21 unit tests for pure recruitment logic
├── site/index.html                       # download page template (relative paths)
├── .github/workflows/deploy.yml          # CI/CD → GitHub Pages
├── MANUAL_TESTING.md                     # in-game checklist + limitations
├── dist/                                 # generated artifacts (gitignored)
├── package.json / package-lock.json / tsconfig.json / .gitignore / LICENSE
```

---

## 3. Commander Stone — implementation

`raajya:commander_stone` (`behavior_pack/items/commander_stone.json`):

- **Non-stackable** via `"minecraft:max_stack_size": 1`. This is *required*: `ItemStack.setDynamicProperty` in the stable 2.11.0 API **only works on non-stackable items** (verified in the official docs and the installed type definitions). The code also guards with `stack.isStackable` and reports a clear error if a misconfigured pack ever makes it stackable.
- **Display name** via `minecraft:display_name`; **Creative availability** via `menu_category` (`items` tab); **distinctive icon** via `minecraft:icon` → `textures/items/commander_stone.png`.
- **No survival recipe** (deferred to a later phase).

### Unique, persistent Commander ID
- A new ID like `RAAJYA-7F31A9C2` is generated on **first initialization** (`generateCommanderId`, 8 uppercase hex chars).
- It is stored on the **ItemStack itself** with `ItemStack.setDynamicProperty("raajya:commander_id", id)`. Because it lives on the item, it **survives slot moves, dropping/picking up, and world save/reload**.
- `getItem()` returns a snapshot, so the code **writes the modified ItemStack back** with `container.setItem(slot, stack)` (with `setLore` showing the ID in-game). This write-back is essential and is the reason "moving between slots keeps the ID" works.
- If a stone already has a valid ID, it is **never regenerated**.
- **The stone is never consumed** during recruitment.
- **Multiple stones are handled safely** (`resolveCommanderStone`):
  - exactly one stone → use/initialize its ID;
  - several stones with the **same** ID → safe (duplicated stone);
  - several stones with **different** IDs, or with any uninitialized stone → **refuse with a clear message** rather than silently assigning a soldier to the wrong commander.

> If a future API ever dropped ItemStack dynamic properties, the compatible alternative would be storing the ID inside the item's `nameTag`/`lore` (fully persistent item data) or a world-level `world.setDynamicProperty` registry keyed by a stamped item uuid. That fallback is *not* needed here: 2.11.0 supports the stable ItemStack dynamic-property API, so the real implementation is used, not a fake.

---

## 4. Royal Soldier Spawner & recruitment

### The block
`raajya:royal_soldier_spawner` is a true custom block (`blocks/royal_soldier_spawner.json`): full cube, `minecraft:geometry.full_block` + `minecraft:material_instances` (both required at `format_version 1.21.80+`), a distinct gold/crown texture, a display name (`tile.raajya:royal_soldier_spawner.name`), a loot table so it drops itself when broken, and a Creative category. It is **placeable anywhere, reusable, and never consumed**.

### Interaction (modern, stable 2.x)
The block binds a **V2 custom block component** `raajya:spawner_interact` (a flattened component in the block JSON), registered in `src/main.ts` via:

```ts
system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.blockComponentRegistry.registerCustomComponent("raajya:spawner_interact", {
    onPlayerInteract: (event) => { if (event.player) handleSpawnerInteraction(event.player, event.block); },
  });
});
```

A `world.afterEvents.playerInteractWithBlock` subscription (gated on `isFirstEvent` and block `typeId`) is kept as a **deduplicated fallback**. Both funnel into `handleSpawnerInteraction`, whose per-player **cooldown** (`COOLDOWN_TICKS = 20`, i.e. 1 second) is set at the start of every attempt, so a single interaction yields exactly one recruitment and one message regardless of how many event sources fire.

### Recruitment flow (`src/features/soldier-spawner/recruitment.ts`)
A two-phase, **atomic with rollback** transaction:

1. **Read-only checks**: inventory access → Commander ID resolution (+ ID initialization persisted on the ItemStack) → count Emerald Blocks across the **entire** inventory → find a **safe, unoccupied spawn position** near the spawner (feet + head air, solid ground below, expanding rings).
2. **Mutating phase** (only after every check passes): spawn exactly one `raajya:royal_guard` → assign the Commander ID to the entity → **consume exactly 5 Emerald Blocks** → success message.
3. **On any exception**: restore every touched inventory slot from cloned originals and `remove()` the spawned entity. No resources are lost and no duplicate soldier is left behind.

Failure guarantees: if there is **no Commander Stone**, **fewer than 5 Emerald Blocks**, conflicting stones, or **no safe spawn location** → no Emerald Blocks are consumed, no soldier is spawned, and an understandable message is shown. The spawner and the Commander Stone are never consumed.

### Inventory handling (`src/features/soldier-spawner/inventory.ts`)
Searches **every slot** (`container.size`, 36 for a player), `countItem` totals Emerald Blocks across multiple stacks, and `planConsume` computes an exact plan that **spreads consumption across stacks**, **preserves remainders**, and **never touches unrelated items**. Modified ItemStacks are always written back with `setItem` (or cleared with `setItem(slot, undefined)`). The pure decision logic lives in `src/utils/recruitment-logic.mjs` and is unit-tested.

---

## 5. Soldier ownership persistence

`raajya:royal_guard` is a **separate custom entity** (not a modified villager) with its own humanoid geometry, 64×64 texture, render controller, client entity definition, health (30) and collision box.

On recruitment, `assignOwnership` stores the Commander ID on the **Entity** with `Entity.setDynamicProperty("raajya:commander_id", commanderId)` (plus a schema version and a `raajya:royal_guard` tag). Entity dynamic properties are stable and **saved with the world**, so each guard's ID survives world save/reload. Ownership comes **only from the Commander Stone** — never from the nearby player or the spawner block. This is the foundation for future multiplayer command authorization.

- Player A's stone `RAAJYA-A123` → all A's guards store `RAAJYA-A123`.
- Player B's stone `RAAJYA-B456` → all B's guards store `RAAJYA-B456`.
- Multiple players can use the same or different spawners independently; the cooldown is per player (`player.id`).

---

## 6. Crafting recipe

`behavior_pack/recipes/royal_soldier_spawner.json` — a full 3×3 `minecraft:recipe_shaped` (format `1.20.10`), tagged for the `crafting_table`:

```
D D D
D D D      D = minecraft:diamond_block
D D D
```

Consumes **exactly 9 Diamond Blocks** and produces **1 reusable `raajya:royal_soldier_spawner`**. `validate.mjs` asserts the pattern, the key, the 9-block count, the tags and the single-item output.

---

## 7. Build & packaging

### Exact local commands
```bash
npm install          # install pinned dev dependencies
npm run typecheck    # strict TypeScript (tsc --noEmit)
npm test             # 21 unit tests for the recruitment logic
npm run validate     # validate every JSON, manifests, UUIDs, recipe, assets, workflow, archives
npm run build        # steps 1–7: typecheck, compile/bundle, stage, validate, package, verify
npm run package      # steps 6–7 only (.mcpack + .mcaddon)
npm run textures     # regenerate the original pixel-art PNGs (optional)
npm run site         # build the GitHub Pages artifact in dist/_site
npm run ci           # typecheck + test + validate + build (all-in-one)
```

`npm run build` compiles TypeScript into a **single ESM `scripts/main.js`** (esbuild, `@minecraft/server` kept external), stages clean copies of both packs into `dist/staging/` with the **version injected from `package.json`**, validates everything, then packages.

### Generated outputs (`dist/`, gitignored)
```
RAAJYA_BP.mcpack          # single Behavior Pack (manifest.json at archive root)
RAAJYA_RP.mcpack          # single Resource Pack (manifest.json at archive root)
RAAJYA.mcaddon            # latest successful build — ALWAYS points to the newest deploy
RAAJYA-v1.0.0.mcaddon     # versioned copy (name derives from package.json version)
SHA256SUMS.txt            # SHA-256 of both .mcaddon files
_site/                    # ready-to-publish Pages site (site + packages at its root)
```

**`.mcaddon` structure:** a genuine ZIP containing the two related `.mcpack` files (`RAAJYA_BP.mcpack`, `RAAJYA_RP.mcpack`). Each `.mcpack` is itself a valid single-pack ZIP with `manifest.json` at its root. The BP and RP are linked through their **mutual manifest UUID dependencies** (each declares the other's `header.uuid`). `validate.mjs` opens the `.mcaddon`, extracts both nested `.mcpack` files, and confirms each has a valid root manifest with the expected UUID. The two standalone `.mcpack` files are also shipped in the Pages artifact, so individual packs can be imported directly on any device.

`dist/` and other generated artifacts are **not** committed (`.gitignore`); they are published through the GitHub Pages deployment artifact.

---

## 8. CI / CD & GitHub Pages

`.github/workflows/deploy.yml` runs on **every push to `main`** and on **`workflow_dispatch`** (manual):

1. `actions/checkout`
2. `actions/setup-node` (Node 20, npm cache)
3. `actions/configure-pages`
4. `npm ci`
5. `npm run typecheck`, `npm test`, `npm run validate`
6. `npm run build` (produces the `.mcaddon`)
7. `node scripts/prepare-site.mjs` (injects version/build info + SHA-256, places packages at the site root)
8. `actions/upload-pages-artifact` (`dist/_site`) → `actions/deploy-pages` in a `github-pages` environment.

Permissions: `contents: read`, `pages: write`, `id-token: write`. The download page uses **relative** links (no hardcoded root URL), so it works on a project Pages site including the repository subpath, and downloads require **no authentication**.

### One-time GitHub repository configuration
1. Create the (empty) GitHub repository `raajya-bedrock-addon` and push the code (see §9).
2. In the repo: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**. (No branch/`docs/` source needed.)
3. Optionally protect the `github-pages` environment. Nothing else is required — the workflow uses `actions/configure-pages` + `actions/deploy-pages`.

### Expected Pages URL format
```
https://<OWNER>.github.io/<REPO>/                          # download page
https://<OWNER>.github.io/<REPO>/RAAJYA.mcaddon           # latest (always)
https://<OWNER>.github.io/<REPO>/RAAJYA-v1.0.0.mcaddon    # versioned
https://<OWNER>.github.io/<REPO>/SHA256SUMS.txt
```
(`<OWNER>`/`<REPO>` are whatever account/repo you push to — no URL is hardcoded in the project.)

---

## 9. Git & pushing to a new repository

No remote is configured and nothing is pushed automatically. Run these yourself:

```bash
cd raajya-bedrock-addon
git init
git add .
git commit -m "Initial working version of RAAJYA"
git branch -M main
# Replace <OWNER> with your GitHub username (do NOT add any URL you don't own):
git remote add origin https://github.com/<OWNER>/raajya-bedrock-addon.git
git push -u origin main
```

Then complete the one-time Pages configuration in §8. Pushing to `main` triggers the first deployment automatically (or run it manually via **Actions → Build & Deploy … → Run workflow**).

---

## 10. Manual in-game testing

See **[MANUAL_TESTING.md](MANUAL_TESTING.md)** for the full 15-point checklist (import → activate packs → verify persistent ID → craft → place → failure cases → successful recruitment → repeated use → multiplayer ownership) plus an explicit statement of testing limitations.

---

## 11. Visual assets

All art is **original, coherent Minecraft-style pixel art** generated reproducibly by `scripts/gen-textures.mjs` (a dependency-free PNG encoder). A consistent royal blue + gold theme is used across the pack icons, Commander Stone gem, spawner block face, and the 64×64 Royal Guard skin. Every referenced texture/geometry/render-controller file exists and every PNG is verified to decode — no missing textures or purple/black placeholders.

---

## 12. Known limitations & honesty

- **In-game testing was not performed.** Minecraft Bedrock cannot be launched in this development environment. Everything that *can* be validated offline is validated: strict TypeScript compilation, 21 unit tests of the recruitment logic, JSON/manifest/UUID/recipe/identifier validation, PNG decoding, archive structure, and workflow/site consistency. Actual in-world behaviour must be verified with [MANUAL_TESTING.md](MANUAL_TESTING.md).
- **Target engine = 1.26.60.** `min_engine_version` is set to `[1, 26, 60]` to match `@minecraft/server` 2.11.0. Pack import on older Bedrock builds may be refused (or the script module may not load). To target an older engine, lower `min_engine_version` and pin a correspondingly older compatible `@minecraft/server` in both `package.json` and the BP manifest dependency.
- **Custom Components V2 / experiment toggle:** V2 custom components (`system.beforeEvents.startup`) are stable on 1.26.x and need no toggle. On preview builds in the 1.21.80–1.21.90 era they required the "Beta APIs"/"Custom Components V2" experiment. The global `playerInteractWithBlock` fallback also covers cases where a custom component would not fire.
- **Commander IDs are random 32-bit hex** (`2^32` space). Collisions are astronomically unlikely in normal play but not cryptographically guaranteed. IDs are per-item and not tied to a player account.
- **`.mcaddon` packaging:** the `.mcaddon` contains the two `.mcpack` files (as specified). If a particular device has trouble importing the container, the two standalone `.mcpack` files are published alongside it and import directly.
- **Initialization side effect:** a Commander Stone's ID is persisted on first interaction even if that recruitment later fails (e.g. too few Emeralds) — this is the intended, harmless "initialize the ID" step from the spec; it never consumes Emerald Blocks or spawns a soldier.
- Commander Stone has **no survival recipe yet** (by design). Guards have a **basic idle/standing state only** — no combat, patrol, or command behaviour.

---

## License

MIT — see [LICENSE](LICENSE).
