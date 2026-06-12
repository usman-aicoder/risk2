import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { replayGame } from "../src/replay.js";
import { runBotGame, simConfig } from "./bot.js";

describe("randomized games preserve all invariants (P1/P4)", () => {
  it("random legal action sequences never corrupt state (3 players)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        runBotGame(seed, 300);
      }),
      { numRuns: 25 },
    );
  });

  it("random legal action sequences never corrupt state (2 and 6 players)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom(2, 6),
        (seed, playerCount) => {
          runBotGame(seed, 200, playerCount);
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe("replay (P4: any game rebuildable from seed + action log)", () => {
  it("replaying a long bot game reproduces the exact final state", () => {
    const { state, actionsApplied } = runBotGame(424242, 500);
    expect(actionsApplied).toBeGreaterThan(50);
    const replayed = replayGame(simConfig(424242), state.log);
    expect(replayed).toEqual(state);
  });

  it("replay holds across many seeds", () => {
    for (const seed of [7, 1001, 90210, 555555]) {
      const { state } = runBotGame(seed, 150);
      expect(replayGame(simConfig(seed), state.log)).toEqual(state);
    }
  });

  it("some games run to completion with a winner", { timeout: 60_000 }, () => {
    let finished = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { state } = runBotGame(seed, 5_000, 2);
      if (state.phase === "gameOver") {
        finished++;
        expect(state.winner).not.toBeNull();
      }
    }
    expect(finished).toBeGreaterThan(0);
  });
});
