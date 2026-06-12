import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply.js";
import type { GameState } from "../src/state.js";
import { makeState, testCard } from "./helpers.js";

function mustApply(state: GameState, playerId: string, action: Parameters<typeof applyAction>[2]) {
  const result = applyAction(state, playerId, action);
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result;
}

describe("turn & phase enforcement (P4)", () => {
  it("rejects actions from a player whose turn it is not", () => {
    const s = makeState({ reinforcements: { A: 3 } });
    const r = applyAction(s, "B", { type: "endPhase" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects out-of-phase actions", () => {
    const s = makeState({ phase: "reinforce", owners: { alaska: { owner: "A", troops: 5 } } });
    const attack = applyAction(s, "A", {
      type: "attack",
      from: "alaska",
      to: "northwest_territory",
      mode: "single",
    });
    expect(attack.ok).toBe(false);
    if (!attack.ok) expect(attack.code).toBe("WRONG_PHASE");

    const inAttack = makeState({ phase: "attack" });
    const trade = applyAction(inAttack, "A", { type: "tradeCards", cardIds: ["x", "y", "z"] });
    expect(trade.ok).toBe(false);
    if (!trade.ok) expect(trade.code).toBe("WRONG_PHASE");
  });

  it("does not mutate the input state", () => {
    const s = makeState({
      reinforcements: { A: 3 },
      owners: { alaska: { owner: "A", troops: 1 } },
    });
    const snapshot = JSON.parse(JSON.stringify(s)) as GameState;
    mustApply(s, "A", { type: "reinforce", territory: "alaska", armies: 2 });
    expect(s).toEqual(snapshot);
  });
});

describe("reinforce phase", () => {
  it("places armies and blocks endPhase until all are placed", () => {
    const s = makeState({
      reinforcements: { A: 5 },
      owners: { alaska: { owner: "A", troops: 1 } },
    });
    const blocked = applyAction(s, "A", { type: "endPhase" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("MUST_PLACE_ALL");

    const placed = mustApply(s, "A", { type: "reinforce", territory: "alaska", armies: 5 });
    expect(placed.state.territories.alaska.troops).toBe(6);
    const ended = mustApply(placed.state, "A", { type: "endPhase" });
    expect(ended.state.phase).toBe("attack");
  });

  it("rejects reinforcing enemy territory and over-placement", () => {
    const s = makeState({
      reinforcements: { A: 3 },
      owners: { alaska: { owner: "B", troops: 1 }, brazil: { owner: "A", troops: 1 } },
    });
    const enemy = applyAction(s, "A", { type: "reinforce", territory: "alaska", armies: 1 });
    expect(enemy.ok).toBe(false);
    if (!enemy.ok) expect(enemy.code).toBe("NOT_OWNER");

    const over = applyAction(s, "A", { type: "reinforce", territory: "brazil", armies: 4 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe("INVALID_ARMIES");
  });
});

describe("card trading (P1)", () => {
  it("trades a valid set for escalating armies and discards the cards", () => {
    const cards = [testCard("infantry"), testCard("infantry"), testCard("infantry")];
    const s = makeState({ cards: { A: cards }, reinforcements: { A: 3 } });
    const r = mustApply(s, "A", { type: "tradeCards", cardIds: cards.map((c) => c.id) });
    const player = r.state.players.find((p) => p.playerId === "A");
    expect(player?.reinforcementsPending).toBe(7); // 3 + first set value 4
    expect(player?.cards).toHaveLength(0);
    expect(r.state.cardSetCount).toBe(1);
    expect(r.state.deck.discardPile).toHaveLength(3);
  });

  it("uses the global escalation counter", () => {
    const cards = [testCard("cavalry"), testCard("cavalry"), testCard("cavalry")];
    const s = makeState({ cards: { A: cards }, cardSetCount: 6 });
    const r = mustApply(s, "A", { type: "tradeCards", cardIds: cards.map((c) => c.id) });
    expect(r.state.players.find((p) => p.playerId === "A")?.reinforcementsPending).toBe(20);
  });

  it("grants +2 on an owned traded territory", () => {
    const cards = [testCard("infantry", "alaska"), testCard("cavalry"), testCard("artillery")];
    const s = makeState({
      cards: { A: cards },
      owners: { alaska: { owner: "A", troops: 1 } },
    });
    const r = mustApply(s, "A", { type: "tradeCards", cardIds: cards.map((c) => c.id) });
    expect(r.state.territories.alaska.troops).toBe(3);
  });

  it("rejects invalid sets and cards not held", () => {
    const cards = [testCard("infantry"), testCard("infantry"), testCard("cavalry")];
    const s = makeState({ cards: { A: cards } });
    const bad = applyAction(s, "A", { type: "tradeCards", cardIds: cards.map((c) => c.id) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("INVALID_SET");

    const notHeld = applyAction(s, "A", {
      type: "tradeCards",
      cardIds: ["nope1", "nope2", "nope3"],
    });
    expect(notHeld.ok).toBe(false);
    if (!notHeld.ok) expect(notHeld.code).toBe("CARDS_NOT_HELD");
  });

  it("forces a trade when holding 5+ cards", () => {
    const cards = [
      testCard("infantry"),
      testCard("infantry"),
      testCard("infantry"),
      testCard("cavalry"),
      testCard("artillery"),
    ];
    const s = makeState({ cards: { A: cards } });
    const blocked = applyAction(s, "A", { type: "endPhase" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("MUST_TRADE");
  });
});

describe("attack, capture, and advance (P1)", () => {
  it("rejects non-adjacent and own-territory attacks and 1-troop attacks", () => {
    const s = makeState({
      phase: "attack",
      owners: {
        alaska: { owner: "A", troops: 5 },
        alberta: { owner: "A", troops: 1 },
        japan: { owner: "B", troops: 1 },
      },
    });
    const far = applyAction(s, "A", {
      type: "attack",
      from: "alaska",
      to: "japan",
      mode: "single",
    });
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.code).toBe("NOT_ADJACENT");

    const own = applyAction(s, "A", {
      type: "attack",
      from: "alaska",
      to: "alberta",
      mode: "single",
    });
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.code).toBe("TARGET_NOT_ENEMY");

    const weak = applyAction(s, "A", {
      type: "attack",
      from: "alberta",
      to: "northwest_territory",
      mode: "single",
    });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.code).toBe("INSUFFICIENT_TROOPS");
  });

  it("fast attack captures, requires a matching advance of >= dice rolled", () => {
    const s = makeState({
      phase: "attack",
      owners: {
        alaska: { owner: "A", troops: 20 },
        northwest_territory: { owner: "B", troops: 2 },
        japan: { owner: "B", troops: 5 },
      },
    });
    const r = mustApply(s, "A", {
      type: "attack",
      from: "alaska",
      to: "northwest_territory",
      mode: "fast",
    });
    expect(r.state.territories.northwest_territory.owner).toBe("A");
    expect(r.state.territories.northwest_territory.troops).toBe(0);
    expect(r.state.capturedThisTurn).toBe(true);
    const pending = r.state.pendingAdvance;
    expect(pending).not.toBeNull();
    if (!pending) throw new Error("expected pending advance");

    // No other action allowed until the advance resolves.
    const again = applyAction(r.state, "A", {
      type: "attack",
      from: "alaska",
      to: "japan",
      mode: "single",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("PENDING_ADVANCE");
    const end = applyAction(r.state, "A", { type: "endPhase" });
    expect(end.ok).toBe(false);
    if (!end.ok) expect(end.code).toBe("PENDING_ADVANCE");

    // Advancing fewer than the dice rolled is rejected.
    if (pending.minArmies > 1) {
      const tooFew = applyAction(r.state, "A", {
        type: "advance",
        from: "alaska",
        to: "northwest_territory",
        armies: pending.minArmies - 1,
      });
      expect(tooFew.ok).toBe(false);
      if (!tooFew.ok) expect(tooFew.code).toBe("INVALID_ARMIES");
    }

    const advanced = mustApply(r.state, "A", {
      type: "advance",
      from: "alaska",
      to: "northwest_territory",
      armies: pending.minArmies,
    });
    expect(advanced.state.pendingAdvance).toBeNull();
    expect(advanced.state.territories.northwest_territory.troops).toBe(pending.minArmies);
    const total =
      advanced.state.territories.alaska.troops +
      advanced.state.territories.northwest_territory.troops;
    expect(total).toBe(r.state.territories.alaska.troops);
  });

  it("awards exactly one card at end of turn after a capture", () => {
    const s = makeState({
      phase: "attack",
      owners: {
        alaska: { owner: "A", troops: 20 },
        northwest_territory: { owner: "B", troops: 1 },
        japan: { owner: "B", troops: 5 }, // keeps B alive after the capture
      },
    });
    const captured = mustApply(s, "A", {
      type: "attack",
      from: "alaska",
      to: "northwest_territory",
      mode: "fast",
    });
    const pending = captured.state.pendingAdvance;
    if (!pending) throw new Error("expected capture");
    const advanced = mustApply(captured.state, "A", {
      type: "advance",
      from: "alaska",
      to: "northwest_territory",
      armies: pending.minArmies,
    });
    const fortifyPhase = mustApply(advanced.state, "A", { type: "endPhase" });
    const turnEnded = mustApply(fortifyPhase.state, "A", { type: "endPhase" });
    const a = turnEnded.state.players.find((p) => p.playerId === "A");
    expect(a?.cards).toHaveLength(1);
    expect(turnEnded.state.deck.drawPile).toHaveLength(43);
    expect(turnEnded.state.currentTurnPlayer).toBe("B");
    expect(turnEnded.state.phase).toBe("reinforce");
    expect(turnEnded.state.capturedThisTurn).toBe(false);
  });

  it("no capture means no card", () => {
    const s = makeState({ phase: "attack" });
    const fortifyPhase = mustApply(s, "A", { type: "endPhase" });
    const turnEnded = mustApply(fortifyPhase.state, "A", { type: "endPhase" });
    expect(turnEnded.state.players.find((p) => p.playerId === "A")?.cards).toHaveLength(0);
    expect(turnEnded.state.deck.drawPile).toHaveLength(44);
  });

  it("eliminates a player at zero territories and transfers their cards", () => {
    const bCards = [testCard("infantry"), testCard("cavalry")];
    const s = makeState({
      phase: "attack",
      cards: { B: bCards },
      owners: { kamchatka: { owner: "B", troops: 1 }, alaska: { owner: "A", troops: 30 } },
      defaultOwner: "C",
    });
    const r = mustApply(s, "A", { type: "attack", from: "alaska", to: "kamchatka", mode: "fast" });
    const b = r.state.players.find((p) => p.playerId === "B");
    const a = r.state.players.find((p) => p.playerId === "A");
    expect(b?.isEliminated).toBe(true);
    expect(b?.cards).toHaveLength(0);
    expect(a?.cards).toHaveLength(2);
    expect(r.state.phase).toBe("attack"); // C still alive, game continues
    expect(r.state.winner).toBeNull();
  });

  it("skips eliminated players in the turn rotation", () => {
    const s = makeState({
      phase: "attack",
      owners: { kamchatka: { owner: "B", troops: 1 }, alaska: { owner: "A", troops: 30 } },
      defaultOwner: "C",
    });
    const captured = mustApply(s, "A", {
      type: "attack",
      from: "alaska",
      to: "kamchatka",
      mode: "fast",
    });
    const pending = captured.state.pendingAdvance;
    if (!pending) throw new Error("expected capture");
    const advanced = mustApply(captured.state, "A", {
      type: "advance",
      from: "alaska",
      to: "kamchatka",
      armies: pending.minArmies,
    });
    const fortifyPhase = mustApply(advanced.state, "A", { type: "endPhase" });
    const turnEnded = mustApply(fortifyPhase.state, "A", { type: "endPhase" });
    expect(turnEnded.state.currentTurnPlayer).toBe("C"); // B skipped
  });

  it("ends the game when the last opponent falls (domination, P1)", () => {
    const s = makeState({
      playerIds: ["A", "B"],
      phase: "attack",
      defaultOwner: "A",
      owners: { kamchatka: { owner: "B", troops: 1 }, alaska: { owner: "A", troops: 30 } },
    });
    const r = mustApply(s, "A", { type: "attack", from: "alaska", to: "kamchatka", mode: "fast" });
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.winner).toBe("A");
    expect(r.state.pendingAdvance).toBeNull();
    expect(r.state.territories.kamchatka.troops).toBeGreaterThanOrEqual(1);

    const after = applyAction(r.state, "A", { type: "endPhase" });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.code).toBe("GAME_OVER");
  });
});

describe("fortify phase", () => {
  it("moves armies along a connected friendly path, then the turn ends", () => {
    const s = makeState({
      phase: "fortify",
      owners: {
        alaska: { owner: "A", troops: 6 },
        alberta: { owner: "A", troops: 1 },
        ontario: { owner: "A", troops: 1 },
        eastern_us: { owner: "A", troops: 1 },
      },
    });
    const r = mustApply(s, "A", { type: "fortify", from: "alaska", to: "eastern_us", armies: 4 });
    expect(r.state.territories.alaska.troops).toBe(2);
    expect(r.state.territories.eastern_us.troops).toBe(5);
    expect(r.state.currentTurnPlayer).toBe("B");
    expect(r.state.phase).toBe("reinforce");
    const b = r.state.players.find((p) => p.playerId === "B");
    expect(b?.reinforcementsPending).toBeGreaterThanOrEqual(3);
    expect(r.state.turnNumber).toBe(2);
  });

  it("rejects unconnected moves and moves that empty the source", () => {
    const s = makeState({
      phase: "fortify",
      owners: { alaska: { owner: "A", troops: 5 }, brazil: { owner: "A", troops: 1 } },
    });
    const far = applyAction(s, "A", { type: "fortify", from: "alaska", to: "brazil", armies: 2 });
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.code).toBe("NOT_CONNECTED");

    const s2 = makeState({
      phase: "fortify",
      owners: { alaska: { owner: "A", troops: 5 }, alberta: { owner: "A", troops: 1 } },
    });
    const all = applyAction(s2, "A", { type: "fortify", from: "alaska", to: "alberta", armies: 5 });
    expect(all.ok).toBe(false);
    if (!all.ok) expect(all.code).toBe("INVALID_ARMIES");
  });
});

describe("objective win at end of turn", () => {
  it("declares the winner when the objective is met at check-conditions", () => {
    const s = makeState({
      phase: "fortify",
      objective: { kind: "territories", count: 14 },
      defaultOwner: "B",
      owners: Object.fromEntries(
        [
          "alaska",
          "northwest_territory",
          "greenland",
          "alberta",
          "ontario",
          "quebec",
          "western_us",
          "eastern_us",
          "central_america",
          "venezuela",
          "peru",
          "brazil",
          "argentina",
          "iceland",
        ].map((code) => [code, { owner: "A", troops: 2 }]),
      ),
    });
    const r = mustApply(s, "A", { type: "endPhase" });
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.winner).toBe("A");
  });
});

describe("action log (P4)", () => {
  it("appends one entry per applied action with its events", () => {
    const s = makeState({
      reinforcements: { A: 3 },
      owners: { alaska: { owner: "A", troops: 1 } },
    });
    const r1 = mustApply(s, "A", { type: "reinforce", territory: "alaska", armies: 3 });
    const r2 = mustApply(r1.state, "A", { type: "endPhase" });
    expect(r2.state.log).toHaveLength(2);
    expect(r2.state.log[0]?.seq).toBe(0);
    expect(r2.state.log[0]?.action.type).toBe("reinforce");
    expect(r2.state.log[1]?.events[0]?.type).toBe("phaseChanged");
  });
});
