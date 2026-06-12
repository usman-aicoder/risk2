import { createGame } from "@risk2/engine";
import { describe, expect, it } from "vitest";
import {
  attackSources,
  attackTargets,
  fortifySources,
  fortifyTargets,
  reinforceTargets,
  viewToValidationState,
} from "@/lib/legalMoves";
import { redactState } from "@/lib/redact";

function setup() {
  const state = createGame({
    gameId: "g",
    mode: "async",
    rngSeed: 777,
    players: [
      { id: "u1", name: "Alice", color: "red", type: "human" },
      { id: "u2", name: "Bob", color: "blue", type: "human" },
    ],
  });
  const view = redactState(state, "u1");
  return { state, vstate: viewToValidationState(view) };
}

describe("legal-move highlighting (P3, engine-backed)", () => {
  it("reinforce targets are exactly the viewer's own territories", () => {
    const { state, vstate } = setup();
    const targets = reinforceTargets(vstate, "u1");
    for (const [code, t] of Object.entries(state.territories)) {
      expect(targets.has(code as never)).toBe(t.owner === "u1");
    }
  });

  it("attack sources need 2+ troops and an enemy neighbor; targets are adjacent enemies", () => {
    const { state, vstate } = setup();
    vstate.phase = "attack";
    const sources = attackSources(vstate, "u1");
    expect(sources.size).toBeGreaterThan(0);
    for (const code of sources) {
      expect(state.territories[code].owner).toBe("u1");
      expect(state.territories[code].troops).toBeGreaterThanOrEqual(2);
      const targets = attackTargets(vstate, "u1", code);
      expect(targets.size).toBeGreaterThan(0);
      for (const t of targets) expect(state.territories[t].owner).toBe("u2");
    }
  });

  it("no legal moves are offered when it is not the viewer's turn", () => {
    const { vstate } = setup();
    vstate.phase = "attack";
    expect(attackSources(vstate, "u2").size).toBe(0);
    expect(reinforceTargets(vstate, "u2").size).toBe(0);
  });

  it("fortify targets are connected friendly territories only", () => {
    const { state, vstate } = setup();
    vstate.phase = "fortify";
    const sources = fortifySources(vstate, "u1");
    for (const code of sources) {
      const targets = fortifyTargets(vstate, "u1", code);
      expect(targets.size).toBeGreaterThan(0);
      for (const t of targets) expect(state.territories[t].owner).toBe("u1");
      expect(targets.has(code)).toBe(false);
    }
  });
});
