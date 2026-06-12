/**
 * Interactive tutorial (P3): walks a first-timer through one full
 * reinforce -> attack -> fortify turn against an easy bot. Instructions are
 * derived purely from the game state, so the tutorial can never disagree
 * with what the board actually allows.
 */

import type { GameState } from "@risk2/engine";

export interface TutorialStep {
  title: string;
  text: string;
}

function attackedThisTurn(state: GameState, playerId: string): boolean {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (!entry) break;
    if (entry.events.some((e) => e.type === "turnStarted")) break;
    if (entry.playerId === playerId && entry.action.type === "attack") return true;
  }
  return false;
}

export function tutorialStep(state: GameState, youId: string): TutorialStep {
  if (state.phase === "gameOver") {
    return state.winner === youId
      ? { title: "World domination!", text: "You finished the tutorial the best possible way." }
      : { title: "Defeated", text: "The bot got you this time — hit Rematch and try again." };
  }

  const you = state.players.find((p) => p.playerId === youId);
  if (!you) return { title: "Tutorial", text: "Watch the game unfold." };

  if (state.currentTurnPlayer !== youId) {
    return {
      title: "The bot is playing",
      text: "Watch the activity feed to see what it does. In online games you'd close the app now — we notify you when it's your turn again.",
    };
  }

  if (state.pendingAdvance) {
    return {
      title: "Territory captured!",
      text: "You must move in at least as many armies as dice you rolled. Use the slider and press Advance.",
    };
  }

  if (state.phase === "reinforce") {
    if (you.reinforcementsPending > 0) {
      return {
        title: state.turnNumber <= 2 ? "Step 1 — Reinforce" : "Reinforce",
        text:
          `You have ${you.reinforcementsPending} armies (a third of your territories, minimum 3, plus continent bonuses). ` +
          "Click your highlighted territories to place them — stacking on a border territory is strongest — then press Confirm placement.",
      };
    }
    return {
      title: "Armies placed",
      text: 'All reinforcements are down. Press "To attack ▸" to move to the attack phase.',
    };
  }

  if (state.phase === "attack") {
    if (!attackedThisTurn(state, youId)) {
      return {
        title: state.turnNumber <= 2 ? "Step 2 — Attack" : "Attack",
        text:
          "Click one of your gold-ringed territories, then an adjacent enemy (red ring). " +
          '"Roll once" fights one round of dice; "Fast attack" keeps rolling until it\'s decided. The defender wins ties!',
      };
    }
    return {
      title: "Keep the pressure or stop",
      text: 'You can attack as often as you like while you have 2+ troops. When you\'re done, press "End attack ▸". Capturing at least one territory earns you a card at the end of your turn.',
    };
  }

  return {
    title: state.turnNumber <= 2 ? "Step 3 — Fortify" : "Fortify",
    text:
      "One tactical move between connected friendly territories — useful for moving idle armies to the front. " +
      'Or just press "End turn". That\'s a complete Risk turn!',
  };
}
