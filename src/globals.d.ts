/**
 * Minimal ambient declaration for the Bedrock scripting host, which exposes a
 * `console` object even though the project is compiled against a bare ES lib
 * (no DOM/Node globals). Keeps strict TypeScript honest without pulling in
 * browser/server type libraries.
 */
declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
