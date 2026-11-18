/**
 * `npm run build` (steps 1–5):
 *   1. Compile TypeScript (strict typecheck + esbuild bundle).
 *   2. Copy the compiled script into the Behavior Pack.
 *   3. Prepare the Behavior Pack (clean staging copy).
 *   4. Prepare the Resource Pack (clean staging copy).
 *   5. Validate JSON files and pack manifests.
 *
 * Packaging (steps 6–7) lives in scripts/package.mjs and is chained by the
 * npm script, so `npm run build` produces the final dist/RAAJYA.mcaddon.
 */
import { typecheck, stagePacks, validateEverything, getVersion, section, pass } from "./lib.mjs";

section(`RAAJYA v${getVersion()} — build (steps 1–5)`);

typecheck();
pass("Strict TypeScript typecheck passed (tsc --noEmit)");

stagePacks();
pass("TypeScript bundled to a single scripts/main.js (@minecraft/server external)");
pass("Behavior Pack + Resource Pack staged in dist/staging (version injected from package.json)");

validateEverything({ archives: false });
console.log("\nBuild stage complete.");
