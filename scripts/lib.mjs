/**
 * Shared build / validation / packaging helpers for RAAJYA.
 * Pure Node (ESM). No third-party runtime deps except esbuild (dev only).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");

export const PATHS = {
  root: ROOT,
  src: path.join(ROOT, "src"),
  ids: path.join(ROOT, "src", "core", "ids.ts"),
  bp: path.join(ROOT, "behavior_pack"),
  rp: path.join(ROOT, "resource_pack"),
  dist: path.join(ROOT, "dist"),
  staging: path.join(ROOT, "dist", "staging"),
  stagingBp: path.join(ROOT, "dist", "staging", "RAAJYA_BP"),
  stagingRp: path.join(ROOT, "dist", "staging", "RAAJYA_RP"),
  build: path.join(ROOT, "build"),
  site: path.join(ROOT, "site"),
  siteOut: path.join(ROOT, "dist", "_site"),
  workflow: path.join(ROOT, ".github", "workflows", "deploy.yml"),
};

export const PACK = {
  latestMcaddon: "RAAJYA.mcaddon",
  bpMcpack: "RAAJYA_BP.mcpack",
  rpMcpack: "RAAJYA_RP.mcpack",
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export const C = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

export function section(title) {
  console.log(`\n${C.dim}── ${title} ──${C.reset}`);
}
export function pass(msg) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`);
}
export function fail(msg) {
  throw new Error(msg);
}
export function assert(condition, msg) {
  if (!condition) fail(msg);
}

export function loadJson(absOrRel) {
  const p = path.isAbsolute(absOrRel) ? absOrRel : path.join(ROOT, absOrRel);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
export function readText(absOrRel) {
  const p = path.isAbsolute(absOrRel) ? absOrRel : path.join(ROOT, absOrRel);
  return fs.readFileSync(p, "utf8");
}
export function exists(p) {
  return fs.existsSync(p);
}

/** Project version from package.json — the single source of truth. */
export function getVersion() {
  return loadJson("package.json").version;
}
export function versionedMcaddonName(version = getVersion()) {
  return `RAAJYA-v${version}.mcaddon`;
}
/** "1.0.0" -> [1, 0, 0] (pads to 3 components). */
export function versionArray(version) {
  const parts = String(version).replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

export function listJsonFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!exists(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".json")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** All files under `base` as clean, relative, POSIX-style paths. */
export function walkFiles(base) {
  const out = [];
  const rec = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) rec(path.join(dir, e.name), rel);
      else if (!e.name.endsWith(".gitkeep") && e.name !== ".DS_Store") out.push(rel);
    }
  };
  rec(base, "");
  return out;
}

export function copyDir(src, dest, skip = () => false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (skip(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// ---------------------------------------------------------------------------
// Compile + stage
// ---------------------------------------------------------------------------

/** Strict type-check via the project's pinned TypeScript (no emit). */
export function typecheck() {
  const tscBin = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const r = spawnSync(process.execPath, [tscBin, "--noEmit"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    fail(`TypeScript typecheck failed:\n${(r.stdout || "").toString()}${(r.stderr || "").toString()}`);
  }
}

/** Bundle src/main.ts into a single ESM file; @minecraft/server stays external. */
export function compileScript() {
  rmrf(PATHS.build);
  fs.mkdirSync(PATHS.build, { recursive: true });
  const outfile = path.join(PATHS.build, "main.js");
  const result = esbuild.buildSync({
    entryPoints: [path.join(PATHS.src, "main.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: ["es2020"],
    external: ["@minecraft/server"],
    sourcemap: false,
    minify: false,
    logLevel: "silent",
    legalComments: "none",
  });
  if (result.errors && result.errors.length) {
    fail(`esbuild errors: ${result.errors.map((e) => e.text).join(", ")}`);
  }
  assert(exists(outfile), "esbuild produced no output file");
  return outfile;
}

/** Compile, assemble both packs in a clean staging dir, inject the version. */
export function stagePacks() {
  const mainJs = compileScript();

  rmrf(PATHS.staging);
  fs.mkdirSync(PATHS.staging, { recursive: true });

  // BP: copy everything except the source scripts/ dir, then add the bundle.
  copyDir(PATHS.bp, PATHS.stagingBp, (_s, e) => e.isDirectory() && e.name === "scripts");
  fs.mkdirSync(path.join(PATHS.stagingBp, "scripts"), { recursive: true });
  fs.copyFileSync(mainJs, path.join(PATHS.stagingBp, "scripts", "main.js"));

  // RP: copy everything verbatim.
  copyDir(PATHS.rp, PATHS.stagingRp);

  // package.json version is authoritative for all pack/module/dep versions.
  const version = versionArray(getVersion());
  for (const manifestPath of [
    path.join(PATHS.stagingBp, "manifest.json"),
    path.join(PATHS.stagingRp, "manifest.json"),
  ]) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.header.version = version;
    for (const mod of manifest.modules) mod.version = version;
    for (const dep of manifest.dependencies ?? []) {
      if (dep.uuid) dep.version = version;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
}

export function ensureStaged() {
  const ready =
    exists(path.join(PATHS.stagingBp, "scripts", "main.js")) &&
    exists(path.join(PATHS.stagingBp, "manifest.json")) &&
    exists(path.join(PATHS.stagingRp, "manifest.json"));
  if (!ready) stagePacks();
}

// ---------------------------------------------------------------------------
// Packaging (zip CLI is available on macOS + GitHub ubuntu runners)
// ---------------------------------------------------------------------------

function runZip(cwd, outfile, entries) {
  rmrf(outfile);
  const args = ["-q", "-X", outfile, ...entries];
  const r = spawnSync("zip", args, { cwd });
  if (r.status !== 0) {
    fail(`zip failed in ${cwd}: ${(r.stderr || r.stdout || "").toString().trim()}`);
  }
}

export function listZip(file) {
  const r = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" });
  if (r.status !== 0) fail(`unzip -Z1 failed for ${file}: ${(r.stderr || "").toString().trim()}`);
  return r.stdout.split("\n").filter(Boolean);
}
export function readZipEntry(file, entry) {
  const r = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  if (r.status !== 0) fail(`unzip -p ${entry} failed for ${file}`);
  return r.stdout;
}
export function readZipEntryBuffer(file, entry) {
  const r = spawnSync("unzip", ["-p", file, entry]);
  if (r.status !== 0) fail(`unzip -p (binary) ${entry} failed for ${file}`);
  return r.stdout; // Buffer
}

/** Create both .mcpack files, the .mcaddon, a versioned copy, and checksums. */
export function packageAll() {
  ensureStaged();
  fs.mkdirSync(PATHS.dist, { recursive: true });

  const bpMcpack = path.join(PATHS.dist, PACK.bpMcpack);
  const rpMcpack = path.join(PATHS.dist, PACK.rpMcpack);

  // .mcpack = zip of ONE pack, with manifest.json at the archive root.
  runZip(PATHS.stagingBp, bpMcpack, walkFiles(PATHS.stagingBp));
  runZip(PATHS.stagingRp, rpMcpack, walkFiles(PATHS.stagingRp));

  // .mcaddon = zip container holding the two related .mcpack files.
  const latest = path.join(PATHS.dist, PACK.latestMcaddon);
  runZip(PATHS.dist, latest, [PACK.bpMcpack, PACK.rpMcpack]);

  const versioned = path.join(PATHS.dist, versionedMcaddonName());
  fs.copyFileSync(latest, versioned);

  const sum = sha256(latest);
  const sumsPath = path.join(PATHS.dist, "SHA256SUMS.txt");
  const lines = [
    `${sum}  ${PACK.latestMcaddon}`,
    `${sum}  ${versionedMcaddonName()}`,
    `${sha256(bpMcpack)}  ${PACK.bpMcpack}`,
    `${sha256(rpMcpack)}  ${PACK.rpMcpack}`,
  ];
  fs.writeFileSync(sumsPath, lines.join("\n") + "\n");
  return { bpMcpack, rpMcpack, latest, versioned, sum, sumsPath };
}

export function hasArchives() {
  return (
    exists(path.join(PATHS.dist, PACK.bpMcpack)) &&
    exists(path.join(PATHS.dist, PACK.rpMcpack)) &&
    exists(path.join(PATHS.dist, PACK.latestMcaddon))
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAllJson() {
  const files = [
    ...listJsonFiles(PATHS.bp),
    ...listJsonFiles(PATHS.rp),
    ...listJsonFiles(PATHS.site),
  ];
  for (const file of files) {
    try {
      JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      fail(`Invalid JSON: ${path.relative(ROOT, file)} -> ${error.message}`);
    }
  }
  pass(`Parsed ${files.length} JSON files (BP, RP, site)`);
  return files.length;
}

function readManifest(kind) {
  const dir = kind === "bp" ? PATHS.bp : PATHS.rp;
  return loadJson(path.join(dir, "manifest.json"));
}

export function validateManifests() {
  const bp = readManifest("bp");
  const rp = readManifest("rp");
  const pkg = loadJson("package.json");
  const pinnedApi = pkg.devDependencies["@minecraft/server"];
  assert(pinnedApi, "package.json must pin @minecraft/server");

  for (const [label, m] of [["BP", bp], ["RP", rp]]) {
    assert(m.format_version === 2, `${label} manifest format_version must be 2`);
    assert(m.header && typeof m.header.name === "string", `${label} header.name missing`);
    assert(UUID_RE.test(m.header.uuid), `${label} header.uuid is not a valid UUID`);
    assert(Array.isArray(m.header.min_engine_version) && m.header.min_engine_version.length === 3,
      `${label} must declare min_engine_version`);
    assert(Array.isArray(m.header.version) && m.header.version.length === 3,
      `${label} header.version must be a [a,b,c] array`);
    assert(
      JSON.stringify(m.header.version) === JSON.stringify(versionArray(getVersion())),
      `${label} header.version must match package.json version ${getVersion()}`,
    );
    assert(Array.isArray(m.modules) && m.modules.length >= 1, `${label} needs modules`);
  }

  // Collect and check every UUID is unique and well-formed.
  const uuids = [bp.header.uuid, rp.header.uuid, ...bp.modules.map((m) => m.uuid), ...rp.modules.map((m) => m.uuid)];
  for (const u of uuids) assert(UUID_RE.test(u), `Invalid UUID in manifest: ${u}`);
  assert(new Set(uuids).size === uuids.length, "All manifest/module UUIDs must be unique");

  // BP module shape: one data + one script module.
  const bpTypes = bp.modules.map((m) => m.type);
  assert(bpTypes.includes("data"), "BP must have a data module");
  assert(bpTypes.includes("script"), "BP must have a script module");
  const scriptMod = bp.modules.find((m) => m.type === "script");
  assert(scriptMod.language === "javascript", "script module language must be javascript");
  assert(scriptMod.entry === "scripts/main.js", "script module entry must be scripts/main.js");
  assert(rp.modules.some((m) => m.type === "resources"), "RP must have a resources module");

  // Script API dependency (SemVer string) must equal the pinned npm version.
  const apiDep = (bp.dependencies ?? []).find((d) => d.module_name === "@minecraft/server");
  assert(apiDep, "BP must declare an @minecraft/server dependency");
  assert(apiDep.version === pinnedApi,
    `Manifest @minecraft/server version (${apiDep.version}) must match pinned npm version (${pinnedApi})`);

  // BP <-> RP link: each pack declares the OTHER pack's header UUID.
  const bpToRp = (bp.dependencies ?? []).find((d) => d.uuid === rp.header.uuid);
  const rpToBp = (rp.dependencies ?? []).find((d) => d.uuid === bp.header.uuid);
  assert(bpToRp, "BP must declare the RP header UUID as a dependency (BP->RP link)");
  assert(rpToBp, "RP must declare the BP header UUID as a dependency (RP->BP link)");

  pass("Manifests valid: unique UUIDs, mutual BP<->RP link, script module, pinned @minecraft/server version");
}

const EXPECTED = {
  itemId: "raajya:commander_stone",
  blockId: "raajya:royal_soldier_spawner",
  entityId: "raajya:royal_guard",
  emerald: "minecraft:emerald_block",
  diamond: "minecraft:diamond_block",
  itemGroup: "raajya:itemGroup.name.commander",
  blockGroup: "raajya:itemGroup.name.stations",
};

/**
 * Creative `menu_category.group` values must be namespaced identifiers
 * (required since item/block format 1.21.60; the engine rejects plain
 * "itemGroup.name.*" strings with a parse error).
 */
const NAMESPACED_ID = /^\S+:\S+$/;

export function validateIdentifiers() {
  const idsTs = readText(PATHS.ids);
  for (const id of [EXPECTED.itemId, EXPECTED.blockId, EXPECTED.entityId, EXPECTED.emerald, EXPECTED.diamond]) {
    assert(idsTs.includes(id), `src/core/ids.ts is missing identifier ${id}`);
  }

  const item = loadJson(path.join(PATHS.bp, "items", "commander_stone.json"));
  assert(item["minecraft:item"].description.identifier === EXPECTED.itemId, "Item identifier mismatch");
  assert(item["minecraft:item"].components["minecraft:max_stack_size"] === 1,
    "Commander Stone must be non-stackable (minecraft:max_stack_size = 1) so dynamic properties work");

  const block = loadJson(path.join(PATHS.bp, "blocks", "royal_soldier_spawner.json"));
  assert(block["minecraft:block"].description.identifier === EXPECTED.blockId, "Block identifier mismatch");
  // ROOT-CAUSE GUARD (v1.1.1): menu_category.group must be namespaced. The old
  // non-namespaced value ("itemGroup.name.misc") failed the format-1.21.60+
  // strict parse of the block description, which aborted registration of the
  // whole block and cascaded into the blocks.json warning and both recipe
  // errors.
  const blockGroup = block["minecraft:block"].description.menu_category?.group;
  assert(typeof blockGroup === "string" && NAMESPACED_ID.test(blockGroup),
    `Block menu_category.group "${blockGroup}" must be a namespaced identifier (e.g. "${EXPECTED.blockGroup}")`);
  const blockComponents = block["minecraft:block"].components;
  // ROOT-CAUSE GUARD: the block must NOT reference any script-registered
  // custom component — that couples block loading to script health and was the
  // cause of the "spawner item missing" failure.
  for (const key of Object.keys(blockComponents)) {
    assert(!key.startsWith("raajya:"),
      `Block JSON must not reference script custom components (found "${key}") — they couple block loading to script registration`);
  }
  // Modern custom blocks require BOTH geometry and material_instances (1.21.80+).
  assert(blockComponents["minecraft:geometry"] && blockComponents["minecraft:material_instances"],
    "Custom block must define both minecraft:geometry and minecraft:material_instances");
  assert(blockComponents["minecraft:material_instances"]["*"],
    "minecraft:material_instances must define the '*' default key");
  // ROOT-CAUSE GUARD (v1.1.1): `minecraft:block_entity` (format 1.26.50+) is
  // the stable API for per-instance dynamic properties, but its `container`
  // parameter is still gated behind the "Upcoming Creator Features"
  // experiment on the target engine (1.26.60 stable), and
  // `container.show_ui_on_interaction` does not exist there at all (added in
  // Preview 26.70.20). Either field made the whole block file fail to parse on
  // a stock (no-experiments) world. Keep the definition on the stable schema;
  // re-add the container only when targeting 1.26.70+, where it is released.
  const blockEntity = blockComponents["minecraft:block_entity"];
  assert(blockEntity, "Station block must declare minecraft:block_entity");
  assert(blockEntity.dynamic_properties === true,
    "minecraft:block_entity must enable dynamic_properties for per-instance station state");
  assert(!("container" in blockEntity),
    "Block JSON must not declare minecraft:block_entity.container — experiment-gated on 1.26.60 (and show_ui_on_interaction does not exist there); it broke block registration (stable from 1.26.70)");

  // Block geometry reference must resolve to our own RP geometry file.
  const blockGeometryId = blockComponents["minecraft:geometry"];
  const blockGeometry = loadJson(path.join(PATHS.rp, "models", "blocks", "royal_soldier_spawner.geo.json"));
  const blockGeometryIds = blockGeometry["minecraft:geometry"].map((g) => g.description.identifier);
  assert(blockGeometryIds.includes(blockGeometryId),
    `Block geometry reference "${blockGeometryId}" must resolve in RP models/blocks/`);

  const entity = loadJson(path.join(PATHS.bp, "entities", "royal_guard.json"));
  assert(entity["minecraft:entity"].description.identifier === EXPECTED.entityId, "BP entity identifier mismatch");
  assert(entity["minecraft:entity"].description.is_experimental === false,
    "Royal Guard must not be experimental");
  // AI: real data-driven behaviors (mirrors vanilla 1.26 shapes).
  const entityComponents = entity["minecraft:entity"].components;
  assert(entityComponents["minecraft:navigation.walk"], "Royal Guard needs minecraft:navigation.walk");
  assert(entityComponents["minecraft:movement.basic"], "Royal Guard needs minecraft:movement.basic");
  assert(entityComponents["minecraft:behavior.melee_box_attack"], "Royal Guard needs melee_box_attack");
  assert(entityComponents["minecraft:persistent"], "Royal Guard must be persistent (no despawn)");
  assert(entityComponents["minecraft:tameable"], "Royal Guard needs minecraft:tameable (script tames it for follow_owner)");
  assert(!entityComponents["minecraft:type_family"].family.includes("monster"),
    "Royal Guard must NOT be in the monster family (other guards would target it)");
  const hurtFilters = JSON.stringify(entityComponents["minecraft:behavior.hurt_by_target"]);
  assert(hurtFilters.includes('"player"'), "hurt_by_target must exclude players from retaliation");
  // Mode component groups + events for every command mode.
  const groups = entity["minecraft:entity"].component_groups;
  const events = entity["minecraft:entity"].events;
  assert(groups["raajya:moving_follow"] && groups["raajya:moving_follow"]["minecraft:behavior.follow_owner"],
    "Component group raajya:moving_follow needs behavior.follow_owner (real pathfinding follow)");
  assert(groups["raajya:moving_follow"]["minecraft:behavior.follow_owner"].post_teleport_distance === -1,
    "follow_owner must disable teleporting (post_teleport_distance: -1)");
  assert(groups["raajya:combat_defend"] && groups["raajya:combat_defend"]["minecraft:behavior.nearest_attackable_target"],
    "Component group raajya:combat_defend needs nearest_attackable_target");
  assert(groups["raajya:combat_attack"] && groups["raajya:combat_attack"]["minecraft:behavior.nearest_attackable_target"],
    "Component group raajya:combat_attack needs nearest_attackable_target");
  assert(groups["raajya:move_patrol"] && groups["raajya:move_patrol"]["minecraft:behavior.random_stroll"],
    "Component group raajya:move_patrol needs random_stroll");
  const targeting = JSON.stringify(groups);
  assert(!/"value"\s*:\s*"player"/.test(targeting),
    "Guards must never target players (nearest_attackable_target filters must exclude the player family)");
  for (const mode of ["stop", "here", "follow", "defend", "attack", "patrol"]) {
    assert(events[`raajya:mode_${mode}`], `Entity must define the raajya:mode_${mode} event`);
  }

  const client = loadJson(path.join(PATHS.rp, "entity", "royal_guard.json"));
  assert(client["minecraft:client_entity"].description.identifier === EXPECTED.entityId,
    "RP client entity identifier mismatch");
  assert(client["minecraft:client_entity"].description.enable_attachables === true,
    "Client entity must enable_attachables so equipment (armor/sword/shield) renders");
  const anims = client["minecraft:client_entity"].description.animations ?? {};
  for (const anim of [
    "animation.humanoid.move",
    "animation.humanoid.look_at_target.default",
    "animation.humanoid.holding",
    "animation.humanoid.attack.rotations",
    "animation.humanoid.bob",
  ]) {
    assert(Object.values(anims).includes(anim), `Client entity must reference vanilla animation ${anim}`);
  }
  // Entity geometry must use the vanilla humanoid bone set so vanilla armor
  // attachables and held items bind correctly (rightItem/leftItem bones).
  const guardGeometryId = client["minecraft:client_entity"].description.geometry.default;
  const guardGeometry = loadJson(path.join(PATHS.rp, "models", "entity", "royal_guard.geo.json"));
  const guardGeometryDef = guardGeometry["minecraft:geometry"].find(
    (g) => g.description.identifier === guardGeometryId,
  );
  assert(guardGeometryDef, `Client entity geometry "${guardGeometryId}" must resolve in RP models/entity/`);
  const boneNames = guardGeometryDef.bones.map((b) => b.name.toLowerCase());
  for (const bone of ["body", "head", "rightarm", "leftarm", "rightleg", "leftleg", "rightitem", "leftitem", "hat"]) {
    assert(boneNames.includes(bone), `Guard geometry must define the vanilla humanoid bone "${bone}"`);
  }

  const blocksJson = loadJson(path.join(PATHS.rp, "blocks.json"));
  assert(blocksJson[EXPECTED.blockId], "RP blocks.json must define the spawner");

  // ROOT-CAUSE GUARD: item icon shortnames must not contain colons (the
  // original missing-icon bug) and must resolve in the item atlas.
  const itemTex = loadJson(path.join(PATHS.rp, "textures", "item_texture.json"));
  for (const key of Object.keys(itemTex.texture_data ?? {})) {
    assert(!key.includes(":"), `item_texture.json shortname "${key}" must not contain a colon`);
  }
  const itemDef = loadJson(path.join(PATHS.bp, "items", "commander_stone.json"));
  // ROOT-CAUSE GUARD (v1.1.1): the item's menu_category.group must be
  // namespaced — the old value failed the strict description parse, which
  // aborted the whole item definition and produced the "Missing icon for
  // data-driven item" error even though the icon wiring was correct.
  const itemGroup = itemDef["minecraft:item"].description.menu_category?.group;
  assert(typeof itemGroup === "string" && NAMESPACED_ID.test(itemGroup),
    `Item menu_category.group "${itemGroup}" must be a namespaced identifier (e.g. "${EXPECTED.itemGroup}")`);
  const iconShortname = itemDef["minecraft:item"].components["minecraft:icon"]?.textures?.default;
  assert(iconShortname, "Commander Stone must define minecraft:icon textures.default");
  assert(!iconShortname.includes(":"), `Icon shortname "${iconShortname}" must not contain a colon`);
  assert(itemTex.texture_data?.[iconShortname],
    `Icon shortname "${iconShortname}" must resolve in item_texture.json`);
  assert(String(itemTex.texture_data[iconShortname].textures) === "textures/items/commander_stone",
    "item_texture.json must map the shortname to textures/items/commander_stone");

  const lang = readText(path.join(PATHS.rp, "texts", "en_US.lang"));
  for (const key of [
    `item.${EXPECTED.itemId}.name`,
    `tile.${EXPECTED.blockId}.name`,
    `entity.${EXPECTED.entityId}.name`,
  ]) {
    assert(lang.includes(key), `en_US.lang missing localization key ${key}`);
  }

  pass("Custom identifiers, namespaced creative groups, station block entity, guard AI/equipment and atlas shortnames all consistent");
}

/**
 * Validate BP/item_catalog/crafting_item_catalog.json — the file that defines
 * RAAJYA's own namespaced creative groups and guarantees both custom entries
 * are listed in (and therefore visible from) the Creative inventory.
 */
export function validateItemCatalog() {
  const catalogPath = path.join(PATHS.bp, "item_catalog", "crafting_item_catalog.json");
  assert(exists(catalogPath), "BP/item_catalog/crafting_item_catalog.json is required (defines our creative groups)");
  const catalog = loadJson(catalogPath);
  const categories = catalog["minecraft:crafting_items_catalog"]?.categories;
  assert(Array.isArray(categories) && categories.length > 0, "Crafting catalog must define at least one category");

  // Every group name must be namespaced, localized, and self-consistent.
  const groups = new Map(); // group name -> { category, icon, items }
  for (const category of categories) {
    assert(["construction", "nature", "equipment", "items"].includes(category.category_name),
      `Catalog category "${category.category_name}" must be one of construction/nature/equipment/items`);
    assert(Array.isArray(category.groups) && category.groups.length > 0,
      `Catalog category "${category.category_name}" must define at least one group`);
    for (const group of category.groups) {
      const id = group.group_identifier;
      assert(id && typeof id.name === "string" && NAMESPACED_ID.test(id.name),
        "Every catalog group_identifier.name must be a namespaced identifier (e.g. raajya:itemGroup.name.stations)");
      assert(!groups.has(id.name), `Catalog group "${id.name}" is defined twice`);
      groups.set(id.name, { category: category.category_name, icon: id.icon, items: group.items });
    }
  }

  const lang = readText(path.join(PATHS.rp, "texts", "en_US.lang"));
  for (const [name, group] of groups) {
    assert(lang.includes(`${name}=`), `en_US.lang must localize the catalog group name "${name}"`);
    assert(Array.isArray(group.items) && group.items.length > 0, `Catalog group "${name}" must list items`);
    for (const item of group.items) {
      assert(typeof item === "string", `Catalog group "${name}" items must be identifier strings`);
    }
  }

  // The item and the block must each be listed in their own named group, with
  // themselves as the group icon, so they are always visible in Creative.
  const itemEntry = groups.get(EXPECTED.itemGroup);
  assert(itemEntry, `Catalog must define the Commander Stone group "${EXPECTED.itemGroup}"`);
  assert(itemEntry.category === "items", "Commander Stone group belongs to the \"items\" category");
  assert(itemEntry.items.includes(EXPECTED.itemId), `Group "${EXPECTED.itemGroup}" must list ${EXPECTED.itemId}`);
  assert(itemEntry.icon === EXPECTED.itemId, `Group "${EXPECTED.itemGroup}" icon must be ${EXPECTED.itemId}`);

  const blockEntry = groups.get(EXPECTED.blockGroup);
  assert(blockEntry, `Catalog must define the station group "${EXPECTED.blockGroup}"`);
  assert(blockEntry.category === "construction", "Station group belongs to the \"construction\" category");
  assert(blockEntry.items.includes(EXPECTED.blockId), `Group "${EXPECTED.blockGroup}" must list ${EXPECTED.blockId}`);
  assert(blockEntry.icon === EXPECTED.blockId, `Group "${EXPECTED.blockGroup}" icon must be ${EXPECTED.blockId}`);

  // The groups referenced by the definitions must be exactly the catalog ones.
  const itemDef = loadJson(path.join(PATHS.bp, "items", "commander_stone.json"));
  const blockDef = loadJson(path.join(PATHS.bp, "blocks", "royal_soldier_spawner.json"));
  assert(itemDef["minecraft:item"].description.menu_category?.group === EXPECTED.itemGroup,
    "Commander Stone menu_category.group must reference the catalog group");
  assert(blockDef["minecraft:block"].description.menu_category?.group === EXPECTED.blockGroup,
    "Spawner block menu_category.group must reference the catalog group");

  pass("Crafting item catalog valid: both custom entries grouped, iconed and localized in Creative");
}

export function validateRecipe() {
  const recipe = loadJson(path.join(PATHS.bp, "recipes", "royal_soldier_spawner.json"));
  const shaped = recipe["minecraft:recipe_shaped"];
  assert(shaped, "Recipe must be minecraft:recipe_shaped");
  assert(shaped.description.identifier, "Recipe needs a description.identifier");
  assert(Array.isArray(shaped.tags) && shaped.tags.includes("crafting_table"),
    "Recipe must be tagged for the crafting table");
  assert(Array.isArray(shaped.pattern) && shaped.pattern.length === 3, "Recipe must use a 3-row pattern");
  assert(shaped.pattern.every((row) => row === "DDD"),
    "Recipe pattern must be a full 3x3 grid of D (DDD / DDD / DDD)");
  const dCount = shaped.pattern.join("").split("").filter((c) => c === "D").length;
  assert(dCount === 9, `Recipe must consume exactly 9 Diamond Blocks (found ${dCount})`);
  assert(shaped.key && shaped.key.D && shaped.key.D.item === EXPECTED.diamond,
    "Recipe key D must be minecraft:diamond_block");
  const result = shaped.result;
  assert(result.item === EXPECTED.blockId, "Recipe result must be raajya:royal_soldier_spawner");
  assert((result.count ?? 1) === 1, "Recipe must output exactly 1 spawner");
  pass("3x3 Diamond Block shaped recipe valid (9 blocks -> 1 reusable spawner)");
}

/** Verify a PNG really decodes (signature, IHDR, IDAT inflate size). */
export function validatePng(file) {
  const b = fs.readFileSync(file);
  assert(b.length > 24 && b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    `Invalid PNG signature: ${path.relative(ROOT, file)}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset + 8 <= b.length) {
    const len = b.readUInt32BE(offset);
    const type = b.subarray(offset + 4, offset + 8).toString("ascii");
    const data = b.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert(data[8] === 8 && data[9] === 6, `PNG must be 8-bit RGBA: ${path.relative(ROOT, file)}`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert(width > 0 && height > 0 && idat.length > 0, `Incomplete PNG: ${path.relative(ROOT, file)}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert(raw.length === height * (1 + width * 4),
    `PNG IDAT decode size mismatch: ${path.relative(ROOT, file)}`);
}

export function validateAssets() {
  const required = [
    "behavior_pack/pack_icon.png",
    "resource_pack/pack_icon.png",
    "resource_pack/textures/items/commander_stone.png",
    "resource_pack/textures/blocks/royal_soldier_spawner.png",
    "resource_pack/textures/entity/royal_guard.png",
    "resource_pack/models/blocks/royal_soldier_spawner.geo.json",
    "resource_pack/models/entity/royal_guard.geo.json",
    "resource_pack/entity/royal_guard.json",
    "resource_pack/render_controllers/royal_guard.json",
    "resource_pack/textures/item_texture.json",
    "resource_pack/textures/terrain_texture.json",
    "resource_pack/blocks.json",
    "resource_pack/texts/en_US.lang",
    "resource_pack/texts/languages.json",
  ];
  for (const rel of required) {
    assert(exists(path.join(ROOT, rel)), `Missing required asset: ${rel}`);
  }
  // Every JSON asset already parsed by validateAllJson; verify key RP references.
  const terrain = loadJson(path.join(PATHS.rp, "textures", "terrain_texture.json"));
  assert(terrain.texture_data && Object.keys(terrain.texture_data).length > 0,
    "terrain_texture.json must define texture_data");
  const geo = loadJson(path.join(PATHS.rp, "models", "entity", "royal_guard.geo.json"));
  assert(Array.isArray(geo["minecraft:geometry"]) || geo["minecraft:geometry"],
    "royal_guard geometry file must contain minecraft:geometry");
  const rc = loadJson(path.join(PATHS.rp, "render_controllers", "royal_guard.json"));
  assert(rc.render_controllers, "render controller file must contain render_controllers");

  // Every PNG must be a real, decodable image (no missing/placeholder art).
  const pngs = required.filter((rel) => rel.endsWith(".png"));
  for (const rel of pngs) validatePng(path.join(ROOT, rel));

  pass(`All ${required.length} required assets present; ${pngs.length} PNGs decode cleanly`);
}

export function validateSiteAndWorkflow() {
  const html = readText(path.join(PATHS.site, "index.html"));
  assert(html.includes("RAAJYA.mcaddon"), "site/index.html must link RAAJYA.mcaddon (relative)");
  assert(html.includes("{{VERSION}}") || html.includes(getVersion()),
    "site/index.html must surface the version");
  assert(html.includes("SHA256") || html.includes("checksum"),
    "site/index.html must surface a SHA-256 checksum");
  assert(!/https?:\/\/[^\s"']*RAAJYA\.mcaddon/.test(html),
    "site must NOT hardcode an absolute download URL (use relative paths)");
  assert(html.includes("RAAJYA_BP.mcpack") && html.includes("RAAJYA_RP.mcpack"),
    "site must link the standalone .mcpack files as a cross-device fallback");

  const wf = readText(PATHS.workflow);
  for (const token of [
    "workflow_dispatch",
    "actions/checkout",
    "actions/setup-node",
    "actions/configure-pages",
    "actions/upload-pages-artifact",
    "actions/deploy-pages",
    "npm ci",
    "npm run build",
    "dist/_site",
    "github-pages",
  ]) {
    assert(wf.includes(token), `deploy.yml must reference ${token}`);
  }
  assert(wf.includes("main"), "deploy.yml must trigger on push to main");
  pass("Deployment workflow + website download paths consistent");
}

function assertPackManifest(manifestText, label) {
  const m = JSON.parse(manifestText);
  assert(m.format_version === 2, `${label}: manifest format_version must be 2`);
  assert(UUID_RE.test(m.header.uuid), `${label}: invalid header UUID`);
  return m;
}

export function validateArchives() {
  assert(hasArchives(), "Archives are missing — run `npm run build` first");

  const bpMcpack = path.join(PATHS.dist, PACK.bpMcpack);
  const rpMcpack = path.join(PATHS.dist, PACK.rpMcpack);

  for (const [file, label] of [[bpMcpack, "BP .mcpack"], [rpMcpack, "RP .mcpack"]]) {
    const entries = listZip(file);
    assert(entries.includes("manifest.json"), `${label}: manifest.json must be at the archive root`);
    assertPackManifest(readZipEntry(file, "manifest.json"), label);
  }
  const bpEntries = listZip(bpMcpack);
  assert(bpEntries.includes("scripts/main.js"), "BP .mcpack must contain scripts/main.js");
  const rpEntries = listZip(rpMcpack);
  assert(rpEntries.some((e) => e.endsWith(".png")), "RP .mcpack must contain texture PNGs");
  pass("Both .mcpack archives valid (manifest at root, script + textures present)");

  // .mcaddon must contain both packs and be a genuine (importable) zip.
  const addon = path.join(PATHS.dist, PACK.latestMcaddon);
  const addonEntries = listZip(addon);
  assert(addonEntries.includes(PACK.bpMcpack), `.mcaddon must contain ${PACK.bpMcpack}`);
  assert(addonEntries.includes(PACK.rpMcpack), `.mcaddon must contain ${PACK.rpMcpack}`);

  const bpHeader = readManifest("bp").header.uuid;
  const rpHeader = readManifest("rp").header.uuid;
  const foundUuids = new Set();
  for (const name of [PACK.bpMcpack, PACK.rpMcpack]) {
    const buf = readZipEntryBuffer(addon, name);
    const tmp = path.join(os.tmpdir(), `raajya-validate-${name}`);
    fs.writeFileSync(tmp, buf);
    const inner = listZip(tmp);
    assert(inner.includes("manifest.json"), `.mcaddon/${name}: nested pack has no root manifest.json`);
    const m = assertPackManifest(readZipEntry(tmp, "manifest.json"), `.mcaddon/${name}`);
    foundUuids.add(m.header.uuid);
    fs.rmSync(tmp);
  }
  assert(foundUuids.has(bpHeader) && foundUuids.has(rpHeader),
    ".mcaddon must contain both BP and RP (matched by header UUID)");
  pass(".mcaddon archive valid: two linked packs inside, genuine zip structure");
}

/** Run the full source validation suite; archives checked only if present. */
export function validateEverything({ archives = true } = {}) {
  section("Validating JSON + packs + workflow");
  validateAllJson();
  validateManifests();
  validateIdentifiers();
  validateItemCatalog();
  validateRecipe();
  validateAssets();
  validateSiteAndWorkflow();
  if (archives && hasArchives()) {
    section("Validating generated archives");
    validateArchives();
  } else if (archives) {
    console.log("  (archives not built yet — run `npm run build` to validate .mcpack/.mcaddon)");
  }
}
