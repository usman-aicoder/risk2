import { describe, expect, it } from "vitest";
import {
  ADJACENCY,
  CONTINENTS,
  CONTINENT_CODES,
  TERRITORY_CODES,
  TERRITORY_CONTINENT,
  isAdjacent,
} from "../src/map.js";
import type { TerritoryCode } from "../src/map.js";

describe("map data (P1: faithful source values)", () => {
  it("has exactly 42 unique territories", () => {
    expect(TERRITORY_CODES).toHaveLength(42);
    expect(new Set(TERRITORY_CODES).size).toBe(42);
  });

  it("has a symmetric adjacency graph with no self-loops", () => {
    for (const code of TERRITORY_CODES) {
      const neighbors = ADJACENCY[code];
      expect(neighbors.length).toBeGreaterThan(0);
      expect(new Set(neighbors).size).toBe(neighbors.length);
      for (const neighbor of neighbors) {
        expect(neighbor).not.toBe(code);
        expect(ADJACENCY[neighbor]).toContain(code);
      }
    }
  });

  it("is a single connected graph", () => {
    const visited = new Set<TerritoryCode>(["alaska"]);
    const queue: TerritoryCode[] = ["alaska"];
    while (queue.length > 0) {
      const current = queue.shift() as TerritoryCode;
      for (const neighbor of ADJACENCY[current]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(visited.size).toBe(42);
  });

  it("matches the source continent sizes and bonuses", () => {
    const expected = {
      north_america: { size: 9, bonus: 5 },
      south_america: { size: 4, bonus: 2 },
      europe: { size: 7, bonus: 5 },
      africa: { size: 6, bonus: 3 },
      asia: { size: 12, bonus: 7 },
      australia: { size: 4, bonus: 2 },
    } as const;
    for (const code of CONTINENT_CODES) {
      expect(CONTINENTS[code].territories).toHaveLength(expected[code].size);
      expect(CONTINENTS[code].bonus).toBe(expected[code].bonus);
    }
  });

  it("partitions all 42 territories into exactly one continent each", () => {
    const seen = new Set<TerritoryCode>();
    for (const code of CONTINENT_CODES) {
      for (const territory of CONTINENTS[code].territories) {
        expect(seen.has(territory)).toBe(false);
        seen.add(territory);
        expect(TERRITORY_CONTINENT[territory]).toBe(code);
      }
    }
    expect(seen.size).toBe(42);
  });

  it("includes the canonical sea bridges", () => {
    expect(isAdjacent("alaska", "kamchatka")).toBe(true);
    expect(isAdjacent("greenland", "iceland")).toBe(true);
    expect(isAdjacent("brazil", "north_africa")).toBe(true);
    expect(isAdjacent("southern_europe", "egypt")).toBe(true);
    expect(isAdjacent("east_africa", "middle_east")).toBe(true);
    expect(isAdjacent("siam", "indonesia")).toBe(true);
    expect(isAdjacent("japan", "mongolia")).toBe(true);
  });

  it("rejects non-adjacent pairs", () => {
    expect(isAdjacent("alaska", "japan")).toBe(false);
    expect(isAdjacent("brazil", "madagascar")).toBe(false);
  });
});
