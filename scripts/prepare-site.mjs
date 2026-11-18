/**
 * `npm run site` — build the GitHub Pages artifact in dist/_site.
 *
 * Injects version/build info + SHA-256 into the HTML template, copies static
 * site assets, and places the .mcaddon files at the site ROOT so the relative
 * download links work on a project Pages site (repo subpath) without any
 * hardcoded absolute URL. Called by CI after `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";
import {
  PATHS,
  ROOT,
  getVersion,
  versionedMcaddonName,
  sha256,
  rmrf,
  copyDir,
  readText,
  assert,
  exists,
  PACK,
  section,
  pass,
} from "./lib.mjs";

section("Preparing GitHub Pages site");

const version = getVersion();
const latest = path.join(PATHS.dist, PACK.latestMcaddon);
assert(exists(latest), "dist/RAAJYA.mcaddon missing — run `npm run build` first.");

const checksum = sha256(latest);
const rawDate = process.env.BUILD_DATE;
const buildDate =
  rawDate && !Number.isNaN(Date.parse(rawDate))
    ? rawDate
    : new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const commit = (process.env.COMMIT_SHA || "local").slice(0, 7);

rmrf(PATHS.siteOut);
fs.mkdirSync(PATHS.siteOut, { recursive: true });

// Copy static site assets (index.html is handled as a template below).
for (const entry of fs.readdirSync(PATHS.site, { withFileTypes: true })) {
  if (entry.name === "index.html") continue;
  const src = path.join(PATHS.site, entry.name);
  const dest = path.join(PATHS.siteOut, entry.name);
  if (entry.isDirectory()) copyDir(src, dest);
  else fs.copyFileSync(src, dest);
}

let html = readText(path.join(PATHS.site, "index.html"));
html = html
  .replaceAll("{{VERSION}}", version)
  .replaceAll("{{VERSIONED_FILE}}", versionedMcaddonName(version))
  .replaceAll("{{CHECKSUM}}", checksum)
  .replaceAll("{{BUILD_DATE}}", buildDate)
  .replaceAll("{{COMMIT}}", commit);
fs.writeFileSync(path.join(PATHS.siteOut, "index.html"), html);

// Place downloadable artifacts at the site root (relative links → any subpath).
fs.copyFileSync(latest, path.join(PATHS.siteOut, PACK.latestMcaddon));
fs.copyFileSync(
  path.join(PATHS.dist, versionedMcaddonName(version)),
  path.join(PATHS.siteOut, versionedMcaddonName(version)),
);
// Standalone packs: a cross-device fallback for importing each pack directly
// if a given device cannot open the .mcaddon container.
for (const name of [PACK.bpMcpack, PACK.rpMcpack]) {
  fs.copyFileSync(path.join(PATHS.dist, name), path.join(PATHS.siteOut, name));
}
fs.copyFileSync(path.join(PATHS.dist, "SHA256SUMS.txt"), path.join(PATHS.siteOut, "SHA256SUMS.txt"));

pass(`Prepared ${path.relative(ROOT, PATHS.siteOut)} (v${version}, build ${buildDate}, commit ${commit})`);
pass(`SHA-256: ${checksum}`);
