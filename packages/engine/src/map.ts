/**
 * Static map data (P1: the sacred core).
 *
 * 42 territories, 6 continents, and the canonical adjacency graph including
 * the classic sea bridges (Alaska–Kamchatka, Greenland–Iceland,
 * Brazil–North Africa, etc.). Adjacency is data, not code, so the visual map
 * can be re-skinned without touching the rules.
 */

export const TERRITORY_CODES = [
  // North America
  "alaska",
  "northwest_territory",
  "greenland",
  "alberta",
  "ontario",
  "quebec",
  "western_us",
  "eastern_us",
  "central_america",
  // South America
  "venezuela",
  "peru",
  "brazil",
  "argentina",
  // Europe
  "iceland",
  "scandinavia",
  "great_britain",
  "northern_europe",
  "western_europe",
  "southern_europe",
  "ukraine",
  // Africa
  "north_africa",
  "egypt",
  "east_africa",
  "congo",
  "south_africa",
  "madagascar",
  // Asia
  "ural",
  "siberia",
  "yakutsk",
  "kamchatka",
  "irkutsk",
  "mongolia",
  "japan",
  "afghanistan",
  "china",
  "middle_east",
  "india",
  "siam",
  // Australia
  "indonesia",
  "new_guinea",
  "western_australia",
  "eastern_australia",
] as const;

export type TerritoryCode = (typeof TERRITORY_CODES)[number];

export const CONTINENT_CODES = [
  "north_america",
  "south_america",
  "europe",
  "africa",
  "asia",
  "australia",
] as const;

export type ContinentCode = (typeof CONTINENT_CODES)[number];

export const ADJACENCY: Record<TerritoryCode, readonly TerritoryCode[]> = {
  // North America
  alaska: ["northwest_territory", "alberta", "kamchatka"],
  northwest_territory: ["alaska", "alberta", "ontario", "greenland"],
  greenland: ["northwest_territory", "ontario", "quebec", "iceland"],
  alberta: ["alaska", "northwest_territory", "ontario", "western_us"],
  ontario: ["northwest_territory", "alberta", "greenland", "quebec", "western_us", "eastern_us"],
  quebec: ["greenland", "ontario", "eastern_us"],
  western_us: ["alberta", "ontario", "eastern_us", "central_america"],
  eastern_us: ["western_us", "ontario", "quebec", "central_america"],
  central_america: ["western_us", "eastern_us", "venezuela"],
  // South America
  venezuela: ["central_america", "peru", "brazil"],
  peru: ["venezuela", "brazil", "argentina"],
  brazil: ["venezuela", "peru", "argentina", "north_africa"],
  argentina: ["peru", "brazil"],
  // Europe
  iceland: ["greenland", "great_britain", "scandinavia"],
  scandinavia: ["iceland", "great_britain", "northern_europe", "ukraine"],
  great_britain: ["iceland", "scandinavia", "northern_europe", "western_europe"],
  northern_europe: ["great_britain", "scandinavia", "ukraine", "southern_europe", "western_europe"],
  western_europe: ["great_britain", "northern_europe", "southern_europe", "north_africa"],
  southern_europe: [
    "western_europe",
    "northern_europe",
    "ukraine",
    "middle_east",
    "egypt",
    "north_africa",
  ],
  ukraine: [
    "scandinavia",
    "northern_europe",
    "southern_europe",
    "ural",
    "afghanistan",
    "middle_east",
  ],
  // Africa
  north_africa: ["brazil", "western_europe", "southern_europe", "egypt", "east_africa", "congo"],
  egypt: ["north_africa", "southern_europe", "middle_east", "east_africa"],
  east_africa: ["egypt", "north_africa", "congo", "south_africa", "madagascar", "middle_east"],
  congo: ["north_africa", "east_africa", "south_africa"],
  south_africa: ["congo", "east_africa", "madagascar"],
  madagascar: ["east_africa", "south_africa"],
  // Asia
  ural: ["ukraine", "siberia", "china", "afghanistan"],
  siberia: ["ural", "yakutsk", "irkutsk", "mongolia", "china"],
  yakutsk: ["siberia", "kamchatka", "irkutsk"],
  kamchatka: ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"],
  irkutsk: ["siberia", "yakutsk", "kamchatka", "mongolia"],
  mongolia: ["siberia", "irkutsk", "kamchatka", "japan", "china"],
  japan: ["kamchatka", "mongolia"],
  afghanistan: ["ukraine", "ural", "china", "india", "middle_east"],
  china: ["ural", "siberia", "mongolia", "afghanistan", "india", "siam"],
  middle_east: ["ukraine", "southern_europe", "egypt", "east_africa", "afghanistan", "india"],
  india: ["middle_east", "afghanistan", "china", "siam"],
  siam: ["india", "china", "indonesia"],
  // Australia
  indonesia: ["siam", "new_guinea", "western_australia"],
  new_guinea: ["indonesia", "western_australia", "eastern_australia"],
  western_australia: ["indonesia", "new_guinea", "eastern_australia"],
  eastern_australia: ["new_guinea", "western_australia"],
};

export interface ContinentData {
  name: string;
  bonus: number;
  territories: readonly TerritoryCode[];
}

export const CONTINENTS: Record<ContinentCode, ContinentData> = {
  north_america: {
    name: "North America",
    bonus: 5,
    territories: [
      "alaska",
      "northwest_territory",
      "greenland",
      "alberta",
      "ontario",
      "quebec",
      "western_us",
      "eastern_us",
      "central_america",
    ],
  },
  south_america: {
    name: "South America",
    bonus: 2,
    territories: ["venezuela", "peru", "brazil", "argentina"],
  },
  europe: {
    name: "Europe",
    bonus: 5,
    territories: [
      "iceland",
      "scandinavia",
      "great_britain",
      "northern_europe",
      "western_europe",
      "southern_europe",
      "ukraine",
    ],
  },
  africa: {
    name: "Africa",
    bonus: 3,
    territories: ["north_africa", "egypt", "east_africa", "congo", "south_africa", "madagascar"],
  },
  asia: {
    name: "Asia",
    bonus: 7,
    territories: [
      "ural",
      "siberia",
      "yakutsk",
      "kamchatka",
      "irkutsk",
      "mongolia",
      "japan",
      "afghanistan",
      "china",
      "middle_east",
      "india",
      "siam",
    ],
  },
  australia: {
    name: "Australia",
    bonus: 2,
    territories: ["indonesia", "new_guinea", "western_australia", "eastern_australia"],
  },
};

export const TERRITORY_NAMES: Record<TerritoryCode, string> = {
  alaska: "Alaska",
  northwest_territory: "Northwest Territory",
  greenland: "Greenland",
  alberta: "Alberta",
  ontario: "Ontario",
  quebec: "Quebec",
  western_us: "Western United States",
  eastern_us: "Eastern United States",
  central_america: "Central America",
  venezuela: "Venezuela",
  peru: "Peru",
  brazil: "Brazil",
  argentina: "Argentina",
  iceland: "Iceland",
  scandinavia: "Scandinavia",
  great_britain: "Great Britain",
  northern_europe: "Northern Europe",
  western_europe: "Western Europe",
  southern_europe: "Southern Europe",
  ukraine: "Ukraine",
  north_africa: "North Africa",
  egypt: "Egypt",
  east_africa: "East Africa",
  congo: "Congo",
  south_africa: "South Africa",
  madagascar: "Madagascar",
  ural: "Ural",
  siberia: "Siberia",
  yakutsk: "Yakutsk",
  kamchatka: "Kamchatka",
  irkutsk: "Irkutsk",
  mongolia: "Mongolia",
  japan: "Japan",
  afghanistan: "Afghanistan",
  china: "China",
  middle_east: "Middle East",
  india: "India",
  siam: "Siam",
  indonesia: "Indonesia",
  new_guinea: "New Guinea",
  western_australia: "Western Australia",
  eastern_australia: "Eastern Australia",
};

/** Continent each territory belongs to, derived from CONTINENTS. */
export const TERRITORY_CONTINENT: Record<TerritoryCode, ContinentCode> = (() => {
  const out = {} as Record<TerritoryCode, ContinentCode>;
  for (const continent of CONTINENT_CODES) {
    for (const territory of CONTINENTS[continent].territories) {
      out[territory] = continent;
    }
  }
  return out;
})();

const TERRITORY_SET: ReadonlySet<string> = new Set(TERRITORY_CODES);

export function isTerritoryCode(value: string): value is TerritoryCode {
  return TERRITORY_SET.has(value);
}

export function isAdjacent(a: TerritoryCode, b: TerritoryCode): boolean {
  return ADJACENCY[a].includes(b);
}
