/** Small logging helpers for the Bedrock scripting host. */

/**
 * Log an error with whatever detail the host gives us. Never throws, so it is
 * safe to call from inside a rollback/error path.
 */
export function logError(context: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.warn(`[RAAJYA] ${context}: ${detail}`);
}

/** Log an informational message (e.g. on world load). */
export function logInfo(message: string): void {
  console.log(`[RAAJYA] ${message}`);
}
