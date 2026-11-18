/**
 * Royal Guard ownership persistence.
 *
 * Ownership is stored as a dynamic property on the entity. `Entity`
 * dynamic properties are stable in `@minecraft/server` 2.11.0 and are saved
 * with the world, so a guard's Commander ID survives world save/reload.
 *
 * NOTE: ownership is NEVER derived from the nearby player or the spawner
 * block. It is always copied from the Commander Stone used to recruit.
 * Advanced command authorisation (using this data) is a future phase.
 */

import type { Entity } from "@minecraft/server";
import {
  OWNERSHIP_SCHEMA_VERSION,
  PROP_COMMANDER_ID,
  PROP_OWNERSHIP_SCHEMA,
  TAG_ROYAL_GUARD,
} from "../../core/constants";
import { isValidCommanderId } from "../../utils/recruitment-logic.mjs";

/** Persist the Commander ID and lightweight metadata on a freshly spawned guard. */
export function assignOwnership(guard: Entity, commanderId: string): void {
  if (!isValidCommanderId(commanderId)) {
    throw new Error(`Refusing to assign an invalid Commander ID: ${String(commanderId)}`);
  }
  guard.setDynamicProperty(PROP_COMMANDER_ID, commanderId);
  guard.setDynamicProperty(PROP_OWNERSHIP_SCHEMA, OWNERSHIP_SCHEMA_VERSION);
  guard.addTag(TAG_ROYAL_GUARD);
}

/** Read a guard's Commander ID back (used by tests/future command phases). */
export function readOwnership(guard: Entity): string | undefined {
  const value = guard.getDynamicProperty(PROP_COMMANDER_ID);
  return typeof value === "string" && isValidCommanderId(value) ? value : undefined;
}
