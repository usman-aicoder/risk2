/**
 * The action vocabulary (Spec §5.2). Each action is valid in exactly one
 * phase; the server validates phase + actor before touching state (P4).
 */

import type { TerritoryCode } from "./map.js";

export type Action =
  | { type: "reinforce"; territory: TerritoryCode; armies: number }
  | { type: "tradeCards"; cardIds: string[] }
  | { type: "attack"; from: TerritoryCode; to: TerritoryCode; mode: "single" | "fast" }
  | { type: "advance"; from: TerritoryCode; to: TerritoryCode; armies: number }
  | { type: "fortify"; from: TerritoryCode; to: TerritoryCode; armies: number }
  | { type: "endPhase" };
