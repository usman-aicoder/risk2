import type { GameState, TerritoryCode } from "@risk2/engine";
import { ADJACENCY, applyAction, createGame, ownedTerritories } from "@risk2/engine";
import { describe, expect, it } from "vitest";
import { redactState } from "@/lib/redact";

function activeGame(): GameState {
  return createGame({
    gameId: "g1",
    mode: "async",
    rngSeed: 12345,
    players: [
      { id: "u1", name: "Alice", color: "red", type: "human" },
      { id: "u2", name: "Bob", color: "blue", type: "human" },
    ],
  });
}

function step(s: GameState, action: Parameters<typeof applyAction>[2]): GameState {
  const r = applyAction(s, s.currentTurnPlayer, action);
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.state;
}

/** Play simple greedy turns until someone holds a card (a capture happened). */
function gameWithACard(): GameState {
  let s = activeGame();
  for (let i = 0; i < 300; i++) {
    if (s.players.some((p) => p.cards.length > 0)) return s;
    const me = s.currentTurnPlayer;
    const player = s.players.find((p) => p.playerId === me);
    if (!player) throw new Error("missing player");

    if (s.pendingAdvance) {
      s = step(s, { type: "advance", ...s.pendingAdvance, armies: s.pendingAdvance.minArmies });
    } else if (s.phase === "reinforce" && player.reinforcementsPending > 0) {
      const territory = ownedTerritories(s, me)[0] as TerritoryCode;
      s = step(s, { type: "reinforce", territory, armies: player.reinforcementsPending });
    } else if (s.phase === "attack") {
      let move: { from: TerritoryCode; to: TerritoryCode } | null = null;
      for (const from of ownedTerritories(s, me)) {
        if (s.territories[from].troops < 2) continue;
        for (const to of ADJACENCY[from]) {
          if (s.territories[to].owner !== me) {
            move = { from, to };
            break;
          }
        }
        if (move) break;
      }
      s = move ? step(s, { type: "attack", ...move, mode: "fast" }) : step(s, { type: "endPhase" });
    } else {
      s = step(s, { type: "endPhase" });
    }
  }
  throw new Error("no card awarded within 300 actions");
}

describe("redactState (P4: hidden information)", () => {
  it("never exposes the RNG seed, draw count, or draw pile contents", () => {
    const view = redactState(activeGame(), "u1");
    const json = JSON.stringify(view);
    expect(json).not.toContain("rngSeed");
    expect(json).not.toContain("rngDraws");
    expect(json).not.toContain('"drawPile":');
    // No card faces are visible anywhere in a fresh game.
    expect(json).not.toContain("card_");
    expect(view.drawPileCount).toBe(44);
  });

  it("shows the viewer's cards but only counts for opponents", () => {
    const s = gameWithACard();
    const holder = s.players.find((p) => p.cards.length > 0);
    if (!holder) throw new Error("expected a card holder");
    const other = s.players.find((p) => p.playerId !== holder.playerId);
    if (!other) throw new Error("expected another player");

    const own = redactState(s, holder.playerId).players.find((p) => p.playerId === holder.playerId);
    expect(own?.cards?.length).toBe(holder.cards.length);

    const seenByOpponent = redactState(s, other.playerId).players.find(
      (p) => p.playerId === holder.playerId,
    );
    expect(seenByOpponent?.cards).toBeNull();
    expect(seenByOpponent?.cardCount).toBe(holder.cards.length);
  });

  it("redacts which card a capture awarded from opponents", () => {
    const s = gameWithACard();
    const holder = s.players.find((p) => p.cards.length > 0);
    if (!holder) throw new Error("expected a card holder");
    const other = s.players.find((p) => p.playerId !== holder.playerId);
    if (!other) throw new Error("expected another player");

    const award = (view: ReturnType<typeof redactState>) =>
      view.feed
        .flatMap((e) => e.events)
        .find((e) => e.type === "cardAwarded" && e.playerId === holder.playerId);

    const fromHolder = award(redactState(s, holder.playerId));
    const fromOther = award(redactState(s, other.playerId));
    expect(fromHolder).toBeDefined();
    expect(fromOther).toBeDefined();
    if (fromHolder?.type === "cardAwarded") expect(fromHolder.cardId).not.toBeNull();
    if (fromOther?.type === "cardAwarded") expect(fromOther.cardId).toBeNull();
  });

  it("keeps the board, discard pile, and battle log public to spectators", () => {
    const s = gameWithACard();
    const spectator = redactState(s, null);
    expect(spectator.you).toBeNull();
    expect(Object.keys(spectator.territories)).toHaveLength(42);
    expect(spectator.feed.length).toBe(s.log.length);
    for (const p of spectator.players) expect(p.cards).toBeNull();
  });
});
