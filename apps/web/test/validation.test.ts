import { describe, expect, it } from "vitest";
import { createGameSchema, parseAction } from "@/lib/validation";

describe("parseAction", () => {
  it("accepts every legal action shape", () => {
    expect(parseAction({ type: "reinforce", territory: "alaska", armies: 3 })).not.toBeNull();
    expect(parseAction({ type: "tradeCards", cardIds: ["a", "b", "c"] })).not.toBeNull();
    expect(
      parseAction({ type: "attack", from: "alaska", to: "kamchatka", mode: "fast" }),
    ).not.toBeNull();
    expect(
      parseAction({ type: "advance", from: "alaska", to: "kamchatka", armies: 3 }),
    ).not.toBeNull();
    expect(
      parseAction({ type: "fortify", from: "alaska", to: "alberta", armies: 2 }),
    ).not.toBeNull();
    expect(parseAction({ type: "endPhase" })).not.toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction({})).toBeNull();
    expect(parseAction({ type: "nuke", territory: "alaska" })).toBeNull();
    expect(parseAction({ type: "reinforce", territory: "alaska" })).toBeNull();
    expect(parseAction({ type: "reinforce", territory: "alaska", armies: 1.5 })).toBeNull();
    expect(parseAction({ type: "reinforce", territory: "alaska", armies: -2 })).toBeNull();
    expect(parseAction({ type: "tradeCards", cardIds: ["a", "b"] })).toBeNull();
    expect(parseAction({ type: "attack", from: "alaska", to: "kamchatka" })).toBeNull();
    expect(
      parseAction({ type: "attack", from: "alaska", to: "kamchatka", mode: "nuclear" }),
    ).toBeNull();
    // unknown extra keys are rejected (strict objects)
    expect(parseAction({ type: "endPhase", sneaky: true })).toBeNull();
  });
});

describe("createGameSchema", () => {
  it("applies casual-friendly defaults", () => {
    const parsed = createGameSchema.parse({});
    expect(parsed).toEqual({
      mode: "async",
      maxPlayers: 6,
      isPrivate: false,
      objective: { kind: "domination" },
      turnDurationHours: 48,
    });
  });

  it("accepts mission objectives and bounds player count", () => {
    expect(
      createGameSchema.parse({
        maxPlayers: 4,
        objective: { kind: "continents", continents: ["australia", "south_america"] },
      }).objective,
    ).toEqual({ kind: "continents", continents: ["australia", "south_america"] });
    expect(() => createGameSchema.parse({ maxPlayers: 7 })).toThrow();
    expect(() =>
      createGameSchema.parse({ objective: { kind: "territories", count: 50 } }),
    ).toThrow();
  });
});
