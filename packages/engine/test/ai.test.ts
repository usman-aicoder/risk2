import { describe, expect, it } from "vitest";
import { chooseBotAction, targetContinent } from "../src/ai/bot.js";
import { applyAction } from "../src/apply.js";
import { buildDeck } from "../src/cards.js";
import { CONTINENTS, TERRITORY_CONTINENT } from "../src/map.js";
import { createGame } from "../src/setup.js";
import type { GameState } from "../src/state.js";
import { assertInvariants } from "./bot.js";
import { makeState } from "./helpers.js";

type Owners = Record<string, { owner: string; troops: number }>;

function giveContinent(owners: Owners, owner: string, continent: keyof typeof CONTINENTS) {
  for (const code of CONTINENTS[continent].territories) {
    owners[code] = { owner, troops: 2 };
  }
}

describe("strategy pillar: continent control + defensible borders", () => {
  it("targets the nearly-locked defensible continent", () => {
    const owners: Owners = {
      // 3 of 4 Australian territories; indonesia is the gap.
      new_guinea: { owner: "A", troops: 2 },
      western_australia: { owner: "A", troops: 2 },
      eastern_australia: { owner: "A", troops: 2 },
      siam: { owner: "A", troops: 2 },
    };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(targetContinent(s, "A")).toBe("australia");
  });

  it("places reinforcements on a frontier chokepoint of the target continent", () => {
    const owners: Owners = {
      new_guinea: { owner: "A", troops: 2 },
      western_australia: { owner: "A", troops: 2 },
      eastern_australia: { owner: "A", troops: 2 },
      indonesia: { owner: "C", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C", reinforcements: { A: 5 } });
    const action = chooseBotAction(s, "A", "hard");
    expect(action.type).toBe("reinforce");
    if (action.type === "reinforce") {
      // Both border indonesia — the only way into Australia.
      expect(["new_guinea", "western_australia"]).toContain(action.territory);
      expect(action.armies).toBe(5); // stack discipline: all on one stack
    }
  });

  it("attacks the capture that completes its continent", () => {
    const owners: Owners = {
      new_guinea: { owner: "A", troops: 8 },
      western_australia: { owner: "A", troops: 2 },
      eastern_australia: { owner: "A", troops: 2 },
      indonesia: { owner: "C", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C", phase: "attack" });
    const action = chooseBotAction(s, "A", "hard");
    expect(action).toMatchObject({ type: "attack", to: "indonesia", mode: "fast" });
  });
});

describe("strategy pillar: stack discipline", () => {
  it("hard bots refuse attacks without an advantage", () => {
    const owners: Owners = {
      alaska: { owner: "A", troops: 3 },
      kamchatka: { owner: "C", troops: 9 },
      northwest_territory: { owner: "C", troops: 9 },
      alberta: { owner: "C", troops: 9 },
    };
    const s = makeState({ owners, defaultOwner: "A", phase: "attack" });
    // A's only frontier stacks face much larger defenders everywhere…
    // except interior territories with default troops — make them interior-only
    // by checking the chosen action is not a hopeless attack from alaska.
    const action = chooseBotAction(s, "A", "hard");
    if (action.type === "attack") {
      const advantage = s.territories[action.from].troops - s.territories[action.to].troops;
      expect(advantage).toBeGreaterThanOrEqual(1);
    }
  });

  it("fortifies an idle interior stack toward the frontier", () => {
    const owners: Owners = {
      // Interior: argentina surrounded by own territory, with a big stack.
      argentina: { owner: "A", troops: 9 },
      peru: { owner: "A", troops: 1 },
      brazil: { owner: "A", troops: 1 },
      venezuela: { owner: "A", troops: 1 },
      central_america: { owner: "C", troops: 3 },
    };
    const s = makeState({ owners, defaultOwner: "C", phase: "fortify" });
    const action = chooseBotAction(s, "A", "hard");
    expect(action.type).toBe("fortify");
    if (action.type === "fortify") {
      expect(action.from).toBe("argentina");
      expect(action.armies).toBe(8);
      // Destination must touch the enemy.
      expect(["peru", "brazil", "venezuela"]).toContain(action.to);
    }
  });

  it("easy bots never fortify", () => {
    const owners: Owners = {
      argentina: { owner: "A", troops: 9 },
      peru: { owner: "A", troops: 1 },
      brazil: { owner: "A", troops: 1 },
      venezuela: { owner: "A", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C", phase: "fortify" });
    expect(chooseBotAction(s, "A", "easy")).toEqual({ type: "endPhase" });
  });
});

describe("strategy pillar: card tempo", () => {
  function withCards(n: number): GameState {
    const s = makeState({ reinforcements: { A: 0 } });
    const player = s.players.find((p) => p.playerId === "A");
    if (!player) throw new Error("missing player");
    player.cards = buildDeck().slice(0, n);
    return s;
  }

  it("easy trades only when forced", () => {
    expect(chooseBotAction(withCards(3), "A", "easy")).toEqual({ type: "endPhase" });
    expect(chooseBotAction(withCards(5), "A", "easy").type).toBe("tradeCards");
  });

  it("medium trades on sight; hard holds out for an explosive value", () => {
    expect(chooseBotAction(withCards(3), "A", "medium").type).toBe("tradeCards");
    // First set is only worth 4 — hard waits…
    expect(chooseBotAction(withCards(3), "A", "hard")).toEqual({ type: "endPhase" });
    // …but once the global counter makes sets valuable, hard cashes in.
    const valuable = withCards(3);
    valuable.cardSetCount = 4; // next set is worth 12
    expect(chooseBotAction(valuable, "A", "hard").type).toBe("tradeCards");
  });
});

describe("bot vs bot: full games are legal and terminate", () => {
  function playFullGame(seed: number): { state: GameState; actions: number } {
    let state = createGame({
      gameId: `ai_${seed}`,
      mode: "async",
      rngSeed: seed,
      players: [
        { id: "H", name: "Hard", color: "red", type: "ai" },
        { id: "E", name: "Easy", color: "blue", type: "ai" },
      ],
    });
    const difficulty = { H: "hard", E: "easy" } as const;
    let actions = 0;
    while (state.phase !== "gameOver" && actions < 8000) {
      const pid = state.currentTurnPlayer as keyof typeof difficulty;
      const action = chooseBotAction(state, pid, difficulty[pid]);
      const result = applyAction(state, pid, action);
      if (!result.ok) {
        throw new Error(`bot proposed illegal action (${result.code}): ${JSON.stringify(action)}`);
      }
      state = result.state;
      assertInvariants(state);
      actions++;
    }
    return { state, actions };
  }

  it("every action is legal and games end with a winner", () => {
    let hardWins = 0;
    for (const seed of [11, 22, 33]) {
      const { state } = playFullGame(seed);
      expect(state.phase).toBe("gameOver");
      expect(state.winner).not.toBeNull();
      if (state.winner === "H") hardWins++;
    }
    // The pillar-playing bot should not lose every game to the random one.
    expect(hardWins).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic: the same seed replays the same game", () => {
    const a = playFullGame(77);
    const b = playFullGame(77);
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
  });
});

describe("target continent sanity", () => {
  it("never recommends a fully-owned continent", () => {
    const owners: Owners = {};
    giveContinent(owners, "A", "australia");
    owners["siam"] = { owner: "A", troops: 3 };
    const s = makeState({ owners, defaultOwner: "C" });
    const target = targetContinent(s, "A");
    expect(target).not.toBe("australia");
    expect(Object.keys(CONTINENTS)).toContain(target);
  });

  it("prefers defensible continents over Asia at similar progress", () => {
    const owners: Owners = {
      // one territory in each of south_america and asia
      peru: { owner: "A", troops: 2 },
      china: { owner: "A", troops: 2 },
    };
    const s = makeState({ owners, defaultOwner: "C" });
    const target = targetContinent(s, "A");
    expect(TERRITORY_CONTINENT["peru"]).toBe("south_america");
    expect(target).not.toBe("asia");
  });
});
