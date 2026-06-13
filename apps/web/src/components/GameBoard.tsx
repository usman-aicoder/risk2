"use client";

/**
 * The strategic map (P3): 42 territory nodes, adjacency edges, troop stacks,
 * ownership colors, and legal-move highlighting. Wheel-zoom and drag-pan.
 */

import type { TerritoryCode } from "@risk2/engine";
import { TERRITORY_CODES, TERRITORY_NAMES } from "@risk2/engine";
import { useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import {
  CONTINENT_LABELS,
  CONTINENT_PATHS,
  EDGES,
  LAND_FILL,
  LAND_STROKE,
  MAP_HEIGHT,
  MAP_ORIGIN_X,
  MAP_ORIGIN_Y,
  MAP_WIDTH,
  PLAYER_COLOR_HEX,
  POSITIONS,
} from "@/lib/mapLayout";
import { CONTINENT_CODES } from "@risk2/engine";
import type { PlayerView } from "@/lib/redact";

export type Highlight = "selected" | "source" | "target";

export interface GameBoardProps {
  view: PlayerView;
  /** Reinforcements staged locally but not yet committed (undo-able, P3). */
  staged?: Record<string, number>;
  highlights?: Partial<Record<TerritoryCode, Highlight>>;
  onTerritoryClick?: (code: TerritoryCode) => void;
  /** Right-click / long-press, used to un-stage a reinforcement. */
  onTerritoryAltClick?: (code: TerritoryCode) => void;
}

const HIGHLIGHT_STYLE: Record<Highlight, { stroke: string; dash?: string; width: number }> = {
  selected: { stroke: "#e8e2d2", width: 3.5 },
  source: { stroke: "#b59a5e", width: 2.5 },
  target: { stroke: "#b56a5a", dash: "5 3", width: 3 },
};

export function GameBoard({
  view,
  staged = {},
  highlights = {},
  onTerritoryClick,
  onTerritoryAltClick,
}: GameBoardProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const moved = useRef(false);

  const vw = MAP_WIDTH / zoom;
  const vh = MAP_HEIGHT / zoom;
  const viewBox = `${MAP_ORIGIN_X + pan.x} ${MAP_ORIGIN_Y + pan.y} ${vw} ${vh}`;

  const clampPan = (x: number, y: number, z: number) => ({
    x: Math.min(Math.max(x, 0), MAP_WIDTH - MAP_WIDTH / z),
    y: Math.min(Math.max(y, 0), MAP_HEIGHT - MAP_HEIGHT / z),
  });

  const changeZoom = (factor: number) => {
    setZoom((z) => {
      const next = Math.min(4, Math.max(1, z * factor));
      setPan((p) => clampPan(p.x, p.y, next));
      return next;
    });
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    changeZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    moved.current = false;
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = ((e.clientX - drag.current.x) / e.currentTarget.clientWidth) * vw;
    const dy = ((e.clientY - drag.current.y) / e.currentTarget.clientHeight) * vh;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    setPan(clampPan(drag.current.panX - dx, drag.current.panY - dy, zoom));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const alaska = POSITIONS.alaska;
  const kamchatka = POSITIONS.kamchatka;

  return (
    <svg
      viewBox={viewBox}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      data-testid="game-board"
    >
      {/* world-map landmasses (backdrop, generated from node clusters) */}
      <g pointerEvents="none">
        {CONTINENT_CODES.map((code) => (
          <path
            key={code}
            d={CONTINENT_PATHS[code]}
            fill={LAND_FILL}
            stroke={LAND_STROKE}
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={0.9}
          />
        ))}
      </g>

      {/* continent labels */}
      {Object.values(CONTINENT_LABELS).map((c) => (
        <text
          key={c.label}
          x={c.x}
          y={c.y}
          textAnchor="middle"
          fontSize={15}
          fill="#41506b"
          fontWeight={700}
          letterSpacing={2}
          style={{ textTransform: "uppercase", userSelect: "none" }}
        >
          {c.label.toUpperCase()}
        </text>
      ))}

      {/* adjacency edges */}
      {EDGES.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={POSITIONS[a].x}
          y1={POSITIONS[a].y}
          x2={POSITIONS[b].x}
          y2={POSITIONS[b].y}
          stroke="#2a3650"
          strokeWidth={2}
        />
      ))}
      {/* the pacific link wraps around the map edge */}
      <line
        x1={alaska.x}
        y1={alaska.y}
        x2={MAP_ORIGIN_X}
        y2={alaska.y}
        stroke="#2a3650"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <line
        x1={kamchatka.x}
        y1={kamchatka.y}
        x2={MAP_ORIGIN_X + MAP_WIDTH}
        y2={kamchatka.y}
        stroke="#2a3650"
        strokeWidth={2}
        strokeDasharray="6 4"
      />

      {/* territory nodes */}
      {TERRITORY_CODES.map((code) => {
        const pos = POSITIONS[code];
        const t = view.territories[code];
        const owner = view.players.find((p) => p.playerId === t.owner);
        const fill = PLAYER_COLOR_HEX[owner?.color ?? "black"] ?? "#3c4150";
        const highlight = highlights[code];
        const stagedHere = staged[code] ?? 0;
        const style = highlight ? HIGHLIGHT_STYLE[highlight] : null;
        return (
          <g
            key={code}
            data-testid={`territory-${code}`}
            data-highlight={highlight ?? undefined}
            data-owner={t.owner}
            data-troops={t.troops}
            role="button"
            aria-label={TERRITORY_NAMES[code]}
            style={{ cursor: onTerritoryClick ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              if (!moved.current) onTerritoryClick?.(code);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onTerritoryAltClick?.(code);
            }}
          >
            <title>{TERRITORY_NAMES[code]}</title>
            <circle cx={pos.x} cy={pos.y} r={19} fill={fill} stroke="#0c0f15" strokeWidth={1.5} />
            {style ? (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={24}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
              />
            ) : null}
            <text
              x={pos.x}
              y={pos.y + 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill="#fff"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {t.troops}
            </text>
            {stagedHere > 0 ? (
              <g>
                <circle cx={pos.x + 16} cy={pos.y - 14} r={10} fill="#46a758" />
                <text
                  x={pos.x + 16}
                  y={pos.y - 10}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill="#fff"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  +{stagedHere}
                </text>
              </g>
            ) : null}
            <text
              x={pos.x}
              y={pos.y + 33}
              textAnchor="middle"
              fontSize={9}
              fill="#8d99b0"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {TERRITORY_NAMES[code]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
