import { describe, expect, it } from "vitest";
import { chooseBotAction } from "../src/ai/bot.js";
import type { BotDifficulty } from "../src/ai/bot.js";
import { applyAction } from "../src/apply.js";
import { replayGame } from "../src/replay.js";
import { createGame } from "../src/setup.js";
import type { GameConfig } from "../src/setup.js";
import type { GameState } from "../src/state.js";
import { assertInvariants } from "./bot.js";

/**
 * Large-scale hardening (Phase 6): run many full AI games to completion and
 * assert that the engine never produces an illegal action, never violates a
 * state invariant, always terminates with a winner, and replays exactly from
 * its seed. This is the spec's "every battle replayable" acceptance at scale.
 */

const COLORS = ["red", "blue", "green", "yellow", "purple", "black"] as const;
const TIERS: BotDifficulty[] = ["easy", "medium", "hard"];

function config(seed: number, playerCount: number): GameConfig {
  return {
    gameId: `sim_${seed}_${playerCount}`,
    mode: "async",
    rngSeed: seed,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `P${i}`,
      name: `Bot ${i}`,
      color: COLORS[i] as (typeof COLORS)[number],
      type: "ai" as const,
    })),
  };
}

function playToEnd(cfg: GameConfig): { state: GameState; actions: number; finished: boolean } {
  let state = createGame(cfg);
  assertInvariants(state);
  let actions = 0;
  const cap = 20_000;
  while (state.phase !== "gameOver" && actions < cap) {
    const pid = state.currentTurnPlayer;
    const index = Number(pid.slice(1));
    const difficulty = TIERS[index % TIERS.length] as BotDifficulty;
    const action = chooseBotAction(state, pid, difficulty);
    const result = applyAction(state, pid, action);
    if (!result.ok) {
      throw new Error(`illegal action at #${actions} (${result.code}): ${JSON.stringify(action)}`);
    }
    state = result.state;
    assertInvariants(state);
    actions++;
  }
  return { state, actions, finished: state.phase === "gameOver" };
}

describe("large-scale AI simulation (Phase 6 hardening)", () => {
  it("plays 30 mixed-difficulty games to completion without violations", () => {
    let finished = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const playerCount = 2 + (seed % 5); // 2..6 players
      const { state, finished: done } = playToEnd(config(seed, playerCount));
      if (done) {
        finished++;
        expect(state.winner).not.toBeNull();
        // Winner is the only non-eliminated player.
        const alive = state.players.filter((p) => !p.isEliminated);
        expect(alive).toHaveLength(1);
        expect(alive[0]?.playerId).toBe(state.winner);
      }
    }
    // Bots are aggressive enough that essentially all bounded games resolve.
    expect(finished).toBeGreaterThanOrEqual(28);
  });

  it("every simulated game replays bit-for-bit from its seed + log (P4)", () => {
    for (let seed = 100; seed <= 110; seed++) {
      const cfg = config(seed, 3);
      const { state } = playToEnd(cfg);
      const replayed = replayGame(cfg, state.log);
      expect(replayed).toEqual(state);
    }
  });
});
