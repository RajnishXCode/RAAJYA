/** Safe, unoccupied spawn-position search around the Royal Soldier Spawner. */

import type { Block, Dimension, Vector3 } from "@minecraft/server";
import { world } from "@minecraft/server";
import {
  DEFAULT_SPAWN_RADIUS,
  MAX_SPAWN_RADIUS,
  MIN_SPAWN_RADIUS,
  PROP_WORLD_SPAWN_RADIUS,
} from "../../core/constants";
import { clampSpawnRadius } from "../../utils/recruitment-logic.mjs";

/** The configured soldier spawn radius (world dynamic property, default 4). */
export function getSpawnRadius(): number {
  const value = world.getDynamicProperty(PROP_WORLD_SPAWN_RADIUS);
  return clampSpawnRadius(
    value,
    DEFAULT_SPAWN_RADIUS,
    MIN_SPAWN_RADIUS,
    MAX_SPAWN_RADIUS,
  );
}

/** Update the configured soldier spawn radius (clamped to 1..16). */
export function setSpawnRadius(radius: number): number {
  const clamped = clampSpawnRadius(
    radius,
    DEFAULT_SPAWN_RADIUS,
    MIN_SPAWN_RADIUS,
    MAX_SPAWN_RADIUS,
  );
  world.setDynamicProperty(PROP_WORLD_SPAWN_RADIUS, clamped);
  return clamped;
}

/**
 * Find a safe standing position near the spawner, or undefined if none exists.
 *
 * A position is "safe" when the two blocks occupied by a standing humanoid
 * (feet + head) are air, and the block directly below is solid (non-air,
 * non-liquid). Candidates are ordered closest-first: the top of the spawner,
 * then expanding square rings (Chebyshev) at the spawner's base level, out to
 * the configured radius.
 */
export function findSafeSpawnLocation(spawner: Block, radius = getSpawnRadius()): Vector3 | undefined {
  const dimension = spawner.dimension;
  const base = spawner.location;

  const candidates: Vector3[] = [];

  // Standing on top of the spawner block itself.
  candidates.push({ x: base.x + 0.5, y: base.y + 1, z: base.z + 0.5 });

  // Expanding square rings around the spawner at its base level.
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) {
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
