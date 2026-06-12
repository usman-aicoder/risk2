// Static map data (P1)
export {
  ADJACENCY,
  CONTINENTS,
  CONTINENT_CODES,
  TERRITORY_CODES,
  TERRITORY_CONTINENT,
  TERRITORY_NAMES,
  isAdjacent,
  isTerritoryCode,
  type ContinentCode,
  type ContinentData,
  type TerritoryCode,
} from "./map.js";

// State & types
export {
  cloneState,
  type GameMode,
  type GameState,
  type LogEntry,
  type Objective,
  type PendingAdvance,
  type Phase,
  type PlayerColor,
  type PlayerState,
  type PlayerType,
  type TerritoryOccupancy,
} from "./state.js";

export { type Action } from "./actions.js";
export { type GameEvent } from "./events.js";

// Cards & combat
export {
  buildDeck,
  drawCard,
  isValidSet,
  tradeValue,
  type Card,
  type CardDesign,
  type DeckState,
} from "./cards.js";
export { attackerDiceCount, defenderDiceCount, resolveRoll, type DiceRoll } from "./combat.js";

// Rules & engine
export {
  areConnected,
  computeReinforcements,
  controlsContinent,
  nextAlivePlayer,
  objectiveMet,
  ownedCount,
  ownedTerritories,
} from "./rules.js";
export {
  FORCED_TRADE_HAND_SIZE,
  validateAction,
  type ErrorCode,
  type ValidationResult,
} from "./validate.js";
export { applyAction, type ActionResult } from "./apply.js";
export { createGame, STARTING_ARMIES, type GameConfig, type PlayerConfig } from "./setup.js";
export { replayGame } from "./replay.js";

// RNG (P4)
export { createRng, shuffleInPlace, type Rng } from "./rng.js";
