import { describe, expect, it } from "vitest";
import { TERRITORY_CODES } from "../src/map.js";
import { computeReinforcements, ownedCount } from "../src/rules.js";
import { createGame, STARTING_ARMIES } from "../src/setup.js";
import type { GameConfig, PlayerConfig } from "../src/setup.js";

function players(n: number): PlayerConfig[] {
  const colors = ["red", "blue", "green", "yellow", "purple", "black"] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `P${i}`,
    name: `Player ${i}`,
    color: colors[i] as PlayerConfig["color"],
    type: "human" as const,
  }));
}

function config(n: number, seed = 1): GameConfig {
  return { gameId: "g1", mode: "async", rngSeed: seed, players: players(n) };
}

describe("createGame (P1 setup, P4 determinism)", () => {
  it("deals all 42 territories evenly in a 3-player game", () => {
    const s = createGame(config(3));
    expect(ownedCount(s, "P0")).toBe(14);
    expect(ownedCount(s, "P1")).toBe(14);
    expect(ownedCount(s, "P2")).toBe(14);
  });

  it("places the classic starting armies for each player count", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const s = createGame(config(n));
      const total = TERRITORY_CODES.reduce((sum, code) => sum + s.territories[code].troops, 0);
      expect(total).toBe((STARTING_ARMIES[n] as number) * n);
      for (const code of TERRITORY_CODES) {
        expect(s.territories[code].troops).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("is deterministic for the same seed and differs across seeds", () => {
    expect(createGame(config(4, 99))).toEqual(createGame(config(4, 99)));
    const a = createGame(config(4, 1));
    const b = createGame(config(4, 2));
    expect(a.territories).not.toEqual(b.territories);
  });

  it("starts with the first player in reinforce with computed reinforcements", () => {
    const s = createGame(config(3));
    expect(s.phase).toBe("reinforce");
    expect(s.currentTurnPlayer).toBe("P0");
    const p0 = s.players.find((p) => p.playerId === "P0");
    expect(p0?.reinforcementsPending).toBe(computeReinforcements(s, "P0"));
    expect(p0?.reinforcementsPending).toBeGreaterThanOrEqual(3);
  });

  it("builds a full shuffled deck and an empty discard pile", () => {
    const s = createGame(config(3));
    expect(s.deck.drawPile).toHaveLength(44);
    expect(s.deck.discardPile).toHaveLength(0);
  });

  it("rejects invalid player counts and duplicate ids/colors", () => {
    expect(() => createGame(config(1))).toThrow();
    expect(() => createGame(config(7))).toThrow();
    const dupIds = config(3);
    (dupIds.players[1] as PlayerConfig).id = "P0";
    expect(() => createGame(dupIds)).toThrow();
    const dupColors = config(3);
    (dupColors.players[1] as PlayerConfig).color = "red";
    expect(() => createGame(dupColors)).toThrow();
  });
});
