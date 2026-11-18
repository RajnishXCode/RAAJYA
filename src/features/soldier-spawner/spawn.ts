/** Safe, unoccupied spawn-position search around the Royal Soldier Spawner. */

import type { Block, Dimension, Vector3 } from "@minecraft/server";
import { SPAWN_SEARCH_RADIUS } from "../../core/constants";

/**
 * Find a safe standing position near the spawner, or undefined if none exists.
 *
 * A position is "safe" when the two blocks occupied by a standing humanoid
 * (feet + head) are air, and the block directly below is solid (non-air,
 * non-liquid). Candidates are ordered closest-first: the top of the spawner,
 * then expanding square rings at the spawner's base level.
 */
export function findSafeSpawnLocation(spawner: Block): Vector3 | undefined {
  const dimension = spawner.dimension;
  const base = spawner.location;

  /** @type {Vector3[]} */
  const candidates: Vector3[] = [];

  // Standing on top of the spawner block itself.
  candidates.push({ x: base.x + 0.5, y: base.y + 1, z: base.z + 0.5 });

  // Expanding rings around the spawner at its base level.
  for (let radius = 1; radius <= SPAWN_SEARCH_RADIUS; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
          continue;
        }
        candidates.push({ x: base.x + dx + 0.5, y: base.y, z: base.z + dz + 0.5 });
      }
    }
  }

  for (const feet of candidates) {
    if (isSafeStandingPosition(dimension, feet)) {
      return feet;
    }
  }
  return undefined;
}

function isSafeStandingPosition(dimension: Dimension, feet: Vector3): boolean {
  const x = Math.floor(feet.x);
  const y = Math.floor(feet.y);
  const z = Math.floor(feet.z);
  try {
    const ground = dimension.getBlock({ x, y: y - 1, z });
    const body = dimension.getBlock({ x, y, z });
    const head = dimension.getBlock({ x, y: y + 1, z });

    // An undefined block means an unloaded/out-of-bounds chunk -> not safe.
    if (!ground || !body || !head) {
      return false;
    }
    if (!body.isAir || !head.isAir) {
      return false;
    }
    if (ground.isAir || ground.isLiquid) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
