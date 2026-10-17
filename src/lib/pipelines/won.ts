/**
 * Stages carry no "won" flag, so a stage counts as won by name — the
 * seeded "Won" stage in every UI language, plus common variants.
 */
const WON_NAMES = new Set(["won", "closed won", "ganado", "ganada", "ganho", "ganha", "성사", "수주"]);

export function isWonStage(stage: { name: string } | null | undefined): boolean {
  return !!stage && WON_NAMES.has(stage.name.trim().toLowerCase());
}

/** Fired when a deal reaches Won; the shell plays a short check-mark. */
export const DEAL_WON_EVENT = "wacrm:deal-won";

export function celebrateWon() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEAL_WON_EVENT));
}
