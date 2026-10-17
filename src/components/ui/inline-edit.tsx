"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Click → edit → Enter saves (blur saves too), Esc cancels. The caller
 * updates its own state optimistically inside `onSave` and reverts on
 * error, so the field never waits on the network.
 */
export function InlineText({
  value,
  onSave,
  placeholder,
  label,
  type = "text",
  display,
  className,
  inputClassName,
  disabled = false,
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder: string;
  /** Accessible name, e.g. "Email". */
  label: string;
  type?: "text" | "email" | "number";
  /** Custom read-only rendering (e.g. a formatted currency). */
  display?: ReactNode;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            // Esc cancels the edit only — don't also close the panel.
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setEditing(false);
          }
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-primary/60 bg-card px-2 text-[13px] text-foreground outline-none",
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label={`${label}: ${value || placeholder}`}
      className={cn(
        "group/inline flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[13px] transition-colors duration-150 enabled:hover:bg-accent disabled:cursor-default",
        value ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{value ? (display ?? value) : placeholder}</span>
      {disabled ? null : (
        <Pencil className="size-3 shrink-0 text-faint opacity-0 transition-opacity duration-150 group-hover/inline:opacity-100" />
      )}
    </button>
  );
}
