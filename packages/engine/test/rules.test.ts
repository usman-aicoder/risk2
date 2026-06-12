import { describe, expect, it } from "vitest";
import { CONTINENTS } from "../src/map.js";
import { areConnected, computeReinforcements, objectiveMet } from "../src/rules.js";
import { makeState } from "./helpers.js";

function giveContinent(
  owners: Record<string, { owner: string; troops: number }>,
  owner: string,
  continent: keyof typeof CONTINENTS,
) {
  for (const code of CONTINENTS[continent].territories) {
    owners[code] = { owner, troops: 1 };
  }
}

describe("reinforcement math (P1: max(3, floor(t/3)) + continent bonuses)", () => {
  it("gives the minimum of 3 for small holdings", () => {
    const owners: Record<string, { owner: string; troops: number }> = {
      alaska: { owner: "A", troops: 1 },
      brazil: { owner: "A", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(computeReinforcements(s, "A")).toBe(3); // 2 territories -> floor 0 -> min 3
  });

  it("uses floor division above the minimum", () => {
    // Give A 14 scattered territories without completing a continent:
    // all of Asia except japan (11), plus alaska, brazil, egypt.
    const owners: Record<string, { owner: string; troops: number }> = {};
    for (const code of CONTINENTS.asia.territories) owners[code] = { owner: "A", troops: 1 };
    owners["japan"] = { owner: "B", troops: 1 };
    owners["alaska"] = { owner: "A", troops: 1 };
    owners["brazil"] = { owner: "A", troops: 1 };
    owners["egypt"] = { owner: "A", troops: 1 };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(computeReinforcements(s, "A")).toBe(4); // floor(14/3) = 4, no bonus
  });

  it("adds continent bonuses for fully controlled continents", () => {
    const owners: Record<string, { owner: string; troops: number }> = {};
    giveContinent(owners, "A", "australia"); // 4 territories, +2
    owners["brazil"] = { owner: "A", troops: 1 };
    owners["peru"] = { owner: "A", troops: 1 };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(computeReinforcements(s, "A")).toBe(5); // max(3, floor(6/3)) + 2
  });

  it("stacks multiple continent bonuses", () => {
    const owners: Record<string, { owner: string; troops: number }> = {};
    giveContinent(owners, "A", "australia"); // +2
    giveContinent(owners, "A", "south_america"); // +2
    giveContinent(owners, "A", "europe"); // +5
    const s = makeState({ owners, defaultOwner: "C" });
    // 15 territories -> 5 base, +9 bonuses
    expect(computeReinforcements(s, "A")).toBe(14);
  });
});

describe("fortify connectivity", () => {
  it("connects through a chain of own territories", () => {
    const owners: Record<string, { owner: string; troops: number }> = {
      alaska: { owner: "A", troops: 5 },
      alberta: { owner: "A", troops: 1 },
      ontario: { owner: "A", troops: 1 },
      eastern_us: { owner: "A", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(areConnected(s, "A", "alaska", "eastern_us")).toBe(true);
  });

  it("does not connect through enemy territory", () => {
    const owners: Record<string, { owner: string; troops: number }> = {
      alaska: { owner: "A", troops: 5 },
      brazil: { owner: "A", troops: 1 },
    };
    const s = makeState({ owners, defaultOwner: "C" });
    expect(areConnected(s, "A", "alaska", "brazil")).toBe(false);
  });
});

describe("objectives", () => {
  it("domination requires all 42 territories", () => {
    const s = makeState({ defaultOwner: "A", owners: { japan: { owner: "B", troops: 1 } } });
    expect(objectiveMet(s, "A")).toBe(false);
    const all = makeState({ defaultOwner: "A" });
    expect(objectiveMet(all, "A")).toBe(true);
  });

  it("territory-count objective", () => {
    const owners: Record<string, { owner: string; troops: number }> = {};
    giveContinent(owners, "A", "asia"); // 12
    const s = makeState({
      owners,
      defaultOwner: "C",
      objective: { kind: "territories", count: 12 },
    });
    expect(objectiveMet(s, "A")).toBe(true);
    expect(objectiveMet(s, "C")).toBe(true); // owns the remaining 30
    const harder = makeState({
      owners,
      defaultOwner: "C",
      objective: { kind: "territories", count: 13 },
    });
    expect(objectiveMet(harder, "A")).toBe(false);
  });

  it("continent objective", () => {
    const owners: Record<string, { owner: string; troops: number }> = {};
    giveContinent(owners, "A", "australia");
    giveContinent(owners, "A", "south_america");
    const s = makeState({
      owners,
      defaultOwner: "C",
      objective: { kind: "continents", continents: ["australia", "south_america"] },
    });
    expect(objectiveMet(s, "A")).toBe(true);
    expect(objectiveMet(s, "C")).toBe(false);
  });
});
