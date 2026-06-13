/**
 * Visual layout for the strategic map. Pure presentation data — the rules
 * live entirely in the engine's adjacency graph (P1: the map can be
 * re-skinned without touching the rules).
 */

import type { ContinentCode, TerritoryCode } from "@risk2/engine";
import { ADJACENCY, CONTINENTS, CONTINENT_CODES, TERRITORY_CODES } from "@risk2/engine";

export const MAP_WIDTH = 1080;
export const MAP_HEIGHT = 560;
export const MAP_ORIGIN_X = -40;
export const MAP_ORIGIN_Y = 0;

/** Node centers, laid out to echo world geography. */
export const POSITIONS: Record<TerritoryCode, { x: number; y: number }> = {
  // North America
  alaska: { x: 55, y: 85 },
  northwest_territory: { x: 150, y: 75 },
  greenland: { x: 295, y: 55 },
  alberta: { x: 130, y: 140 },
  ontario: { x: 213, y: 138 },
  quebec: { x: 288, y: 130 },
  western_us: { x: 143, y: 205 },
  eastern_us: { x: 228, y: 208 },
  central_america: { x: 165, y: 273 },
  // South America
  venezuela: { x: 212, y: 338 },
  peru: { x: 203, y: 410 },
  brazil: { x: 278, y: 388 },
  argentina: { x: 228, y: 480 },
  // Europe
  iceland: { x: 392, y: 88 },
  scandinavia: { x: 472, y: 70 },
  great_britain: { x: 398, y: 152 },
  northern_europe: { x: 470, y: 148 },
  ukraine: { x: 548, y: 110 },
  western_europe: { x: 408, y: 218 },
  southern_europe: { x: 482, y: 210 },
  // Africa
  north_africa: { x: 432, y: 300 },
  egypt: { x: 502, y: 282 },
  east_africa: { x: 548, y: 348 },
  congo: { x: 490, y: 385 },
  south_africa: { x: 505, y: 460 },
  madagascar: { x: 580, y: 462 },
  // Asia
  ural: { x: 632, y: 105 },
  siberia: { x: 700, y: 70 },
  yakutsk: { x: 778, y: 52 },
  kamchatka: { x: 862, y: 65 },
  irkutsk: { x: 762, y: 122 },
  mongolia: { x: 772, y: 185 },
  japan: { x: 872, y: 180 },
  afghanistan: { x: 618, y: 185 },
  china: { x: 712, y: 245 },
  middle_east: { x: 568, y: 252 },
  india: { x: 655, y: 295 },
  siam: { x: 725, y: 322 },
  // Australia
  indonesia: { x: 762, y: 402 },
  new_guinea: { x: 852, y: 382 },
  western_australia: { x: 792, y: 482 },
  eastern_australia: { x: 868, y: 468 },
};

export const CONTINENT_LABELS: Record<ContinentCode, { x: number; y: number; label: string }> = {
  north_america: { x: 168, y: 28, label: "North America" },
  south_america: { x: 240, y: 528, label: "South America" },
  europe: { x: 470, y: 32, label: "Europe" },
  africa: { x: 500, y: 518, label: "Africa" },
  asia: { x: 716, y: 22, label: "Asia" },
  australia: { x: 822, y: 528, label: "Australia" },
};

export const PLAYER_COLOR_HEX: Record<string, string> = {
  red: "#a4564f",
  blue: "#4f6b8c",
  green: "#5c7d58",
  yellow: "#ad9656",
  purple: "#7c6390",
  black: "#454b5a",
};

/** Muted landmass styling for the world-map backdrop. */
export const LAND_FILL = "#26313f";
export const LAND_STROKE = "#36465a";

interface Point {
  x: number;
  y: number;
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Push each hull vertex outward from the centroid so land wraps the nodes. */
function expand(points: Point[], pad: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}

/** Smooth closed path through the points (quadratic curves via edge midpoints). */
function smoothClosedPath(points: Point[]): string {
  const n = points.length;
  if (n < 3) return "";
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[n - 1]!, points[0]!);
  let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const cur = points[i]!;
    const m = mid(cur, points[(i + 1) % n]!);
    d += ` Q ${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * Stylized landmass silhouette per continent, generated from its territory
 * node positions — a world-map backdrop with no external image asset.
 */
export const CONTINENT_PATHS: Record<ContinentCode, string> = (() => {
  const out = {} as Record<ContinentCode, string>;
  for (const code of CONTINENT_CODES) {
    const points = CONTINENTS[code].territories.map((t) => POSITIONS[t]);
    out[code] = smoothClosedPath(expand(convexHull(points), 46));
  }
  return out;
})();

/** Each adjacency once. The Alaska–Kamchatka pacific link is special-cased. */
export const EDGES: [TerritoryCode, TerritoryCode][] = (() => {
  const edges: [TerritoryCode, TerritoryCode][] = [];
  for (const from of TERRITORY_CODES) {
    for (const to of ADJACENCY[from]) {
      if (from < to && !(from === "alaska" && to === "kamchatka")) {
        edges.push([from, to]);
      }
    }
  }
  return edges;
})();
