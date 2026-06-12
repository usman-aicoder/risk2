/**
 * Replay (P4): any game state can be rebuilt from its setup config and the
 * append-only action log, because setup and every dice roll derive from the
 * seeded RNG.
 */

import { applyAction } from "./apply.js";
import { createGame } from "./setup.js";
import type { GameConfig } from "./setup.js";
import type { GameState, LogEntry } from "./state.js";

export function replayGame(config: GameConfig, log: readonly LogEntry[]): GameState {
  let state = createGame(config);
  for (const entry of log) {
    const result = applyAction(state, entry.playerId, entry.action);
    if (!result.ok) {
      throw new Error(`Replay failed at seq ${entry.seq}: ${result.code} — ${result.message}`);
    }
    state = result.state;
  }
  return state;
}
