/**
 * `npm run package` (steps 6–7):
 *   6. Package both staged packs into valid .mcpack files.
 *   7. Package the two .mcpack files into one installable .mcaddon.
 *
 * Also produces the versioned .mcaddon, a SHA-256 checksum file, and validates
 * the resulting archives. Safe to run standalone (it stages packs if needed).
 */
import path from "node:path";
import {
  packageAll,
  validateArchives,
  getVersion,
  versionedMcaddonName,
  PACK,
  PATHS,
  section,
  pass,
} from "./lib.mjs";

section(`RAAJYA v${getVersion()} — package (steps 6–7)`);

const out = packageAll();
pass(`Created ${PACK.bpMcpack} and ${PACK.rpMcpack}`);
pass(`Created ${PACK.latestMcaddon} (always the latest successful build)`);
pass(`Created ${versionedMcaddonName()}`);
pass(`Wrote checksum file ${path.basename(out.sumsPath)} (sha256 ${out.sum.slice(0, 16)}…)`);

section("Verifying generated archives");
validateArchives();
console.log("\nPackaging complete → dist/RAAJYA.mcaddon");
