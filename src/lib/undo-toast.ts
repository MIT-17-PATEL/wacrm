import { toast } from "sonner";

/** Reversible actions get this instead of an "Are you sure?" dialog. */
export const UNDO_MS = 5000;

export function undoToast(message: string, undoLabel: string, onUndo: () => void) {
  toast(message, {
    duration: UNDO_MS,
    action: { label: undoLabel, onClick: onUndo },
  });
}
