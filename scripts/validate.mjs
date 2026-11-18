/**
 * `npm run validate` — full validation suite:
 *   - every JSON file parses;
 *   - manifest UUIDs are unique/valid and the BP<->RP links are correct;
 *   - custom identifiers match across BP, RP, lang, and TypeScript;
 *   - the 3x3 Diamond Block recipe is exactly 9 blocks -> 1 spawner;
 *   - all visual/definition assets exist and PNGs decode;
 *   - the deployment workflow and website paths are consistent;
 *   - generated .mcpack / .mcaddon archives are structurally valid (when built).
 */
import { validateEverything } from "./lib.mjs";

validateEverything({ archives: true });
console.log("\nAll validations passed.");
