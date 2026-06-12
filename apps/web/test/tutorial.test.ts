import type { GameState, TerritoryCode } from "@risk2/engine";
import {
  ADJACENCY,
  applyAction,
  chooseBotAction,
  createGame,
  ownedTerritories,
} from "@risk2/engine";
import { describe, expect, it } from "vitest";
import { tutorialStep } from "@/lib/tutorial";

function freshGame(): GameState {
  return createGame({
    gameId: "tut",
    mode: "live",
    rngSeed: 20260612,
    players: [
      { id: "p0", name: "You", color: "red", type: "human" },
      { id: "p1", name: "Tutor Bot", color: "blue", type: "ai" },
    ],
  });
}

function step(s: GameState, action: Parameters<typeof applyAction>[2]): GameState {
  const r = applyAction(s, s.currentTurnPlayer, action);
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.state;
}

describe("tutorial step derivation (P3)", () => {
  it("tracks a full turn: reinforce -> attack -> fortify -> bot's turn", () => {
    let s = freshGame();
    expect(tutorialStep(s, "p0").title).toContain("Reinforce");

    const territory = ownedTerritories(s, "p0")[0] as TerritoryCode;
    const pending = s.players[0]?.reinforcementsPending ?? 0;
    s = step(s, { type: "reinforce", territory, armies: pending });
    expect(tutorialStep(s, "p0").title).toBe("Armies placed");

    s = step(s, { type: "endPhase" });
    expect(tutorialStep(s, "p0").title).toContain("Attack");

    // After any attack, the guidance changes to "keep going or stop".
    const from = ownedTerritories(s, "p0").find(
      (code) =>
        s.territories[code].troops >= 2 &&
        ADJACENCY[code].some((n) => s.territories[n].owner !== "p0"),
    );
    if (!from) throw new Error("no attack source");
    const to = ADJACENCY[from].find((n) => s.territories[n].owner !== "p0") as TerritoryCode;
    s = step(s, { type: "attack", from, to, mode: "single" });
    if (s.pendingAdvance) {
      expect(tutorialStep(s, "p0").title).toBe("Territory captured!");
      s = step(s, { type: "advance", ...s.pendingAdvance, armies: s.pendingAdvance.minArmies });
    } else {
      expect(tutorialStep(s, "p0").title).toBe("Keep the pressure or stop");
    }

    s = step(s, { type: "endPhase" });
    expect(tutorialStep(s, "p0").title).toContain("Fortify");

    s = step(s, { type: "endPhase" });
    expect(tutorialStep(s, "p0").title).toBe("The bot is playing");

    // The easy bot can finish its whole turn legally.
    let guard = 0;
    while (s.currentTurnPlayer === "p1" && s.phase !== "gameOver" && guard++ < 50) {
      s = step(s, chooseBotAction(s, "p1", "easy"));
    }
    expect(s.currentTurnPlayer).toBe("p0");
  });
});
