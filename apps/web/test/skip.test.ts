import type { GameState, TerritoryCode } from "@risk2/engine";
import { ADJACENCY, applyAction, cloneState, createGame, ownedTerritories } from "@risk2/engine";
import { describe, expect, it } from "vitest";
import { MAX_SKIP_ACTIONS, nextSkipAction } from "@/lib/skip";

function freshGame(): GameState {
  return createGame({
    gameId: "g",
    mode: "async",
    rngSeed: 1234,
    players: [
      { id: "u1", name: "Alice", color: "red", type: "human" },
      { id: "u2", name: "Bob", color: "blue", type: "human" },
    ],
  });
}

/** Apply skip actions until the turn passes; returns the actions taken. */
function skipWholeTurn(state: GameState): { state: GameState; actions: number } {
  const before = state.currentTurnPlayer;
  let actions = 0;
  while (state.currentTurnPlayer === before && state.phase !== "gameOver") {
    if (actions >= MAX_SKIP_ACTIONS) throw new Error("skip overran its bound");
    const action = nextSkipAction(state);
    if (!action) break;
    const result = applyAction(state, state.currentTurnPlayer, action);
    if (!result.ok) throw new Error(`skip proposed illegal action: ${result.code}`);
    state = result.state;
    actions++;
  }
  return { state, actions };
}

describe("auto-skip policy (P2 deadlines, P4 legality)", () => {
  it("passes a fresh turn to the next player without attacking", () => {
    const initial = freshGame();
    const { state, actions } = skipWholeTurn(initial);
    expect(state.currentTurnPlayer).toBe("u2");
    expect(state.phase).toBe("reinforce");
    expect(actions).toBeLessThanOrEqual(MAX_SKIP_ACTIONS);
    // No combat happened: every territory keeps its owner.
    for (const [code, t] of Object.entries(initial.territories)) {
      expect(state.territories[code as TerritoryCode].owner).toBe(t.owner);
    }
  });

  it("places all reinforcements on the strongest territory", () => {
    const initial = freshGame();
    const pending = initial.players[0]?.reinforcementsPending ?? 0;
    const owned = ownedTerritories(initial, "u1");
    const strongest = owned.reduce((best, code) =>
      initial.territories[code].troops > initial.territories[best].troops ? code : best,
    );
    const { state } = skipWholeTurn(initial);
    expect(state.territories[strongest].troops).toBe(
      initial.territories[strongest].troops + pending,
    );
  });

  it("trades first when holding 5+ cards (forced trade)", () => {
    const state = cloneState(freshGame());
    const player = state.players[0];
    if (!player) throw new Error("missing player");
    player.cards = state.deck.drawPile.splice(0, 5);

    const first = nextSkipAction(state);
    expect(first?.type).toBe("tradeCards");
    const { state: after } = skipWholeTurn(state);
    expect(after.currentTurnPlayer).toBe("u2");
    expect(after.cardSetCount).toBe(1);
  });

  it("resolves a pending advance with the minimum armies", () => {
    const state = cloneState(freshGame());
    state.phase = "attack";
    const players0 = state.players[0];
    if (!players0) throw new Error("missing player");
    players0.reinforcementsPending = 0;
    // Fabricate a just-captured territory awaiting its mandatory advance.
    const from = ownedTerritories(state, "u1").find((code) => state.territories[code].troops >= 3);
    if (!from) throw new Error("no strong territory");
    const to = ADJACENCY[from].find((n) => state.territories[n].owner !== "u1");
    if (!to) throw new Error("no adjacent enemy");
    state.territories[to] = { owner: "u1", troops: 0 };
    state.pendingAdvance = { from, to, minArmies: 2 };

    const action = nextSkipAction(state);
    expect(action).toEqual({ type: "advance", from, to, armies: 2 });
    const { state: after } = skipWholeTurn(state);
    expect(after.currentTurnPlayer).toBe("u2");
    expect(after.territories[to].troops).toBe(2);
  });

  it("returns null once the game is over", () => {
    const state = cloneState(freshGame());
    state.phase = "gameOver";
    state.winner = "u1";
    expect(nextSkipAction(state)).toBeNull();
  });
});
