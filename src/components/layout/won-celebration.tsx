"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { DEAL_WON_EVENT } from "@/lib/pipelines/won";

/**
 * A short check-mark when a deal moves to Won: a circle and tick drawn
 * in ~600ms, then gone. Framer's `reducedMotion="user"` (MotionProvider)
 * turns the draw into an instant fade for reduced-motion users.
 */
export function WonCelebration() {
  const t = useTranslations("Shell");
  const [key, setKey] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWon = () => {
      clearTimeout(timer);
      setKey(Date.now());
      timer = setTimeout(() => setKey(null), 1100);
    };
    window.addEventListener(DEAL_WON_EVENT, onWon);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DEAL_WON_EVENT, onWon);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
      <AnimatePresence>
        {key !== null ? (
          <motion.div
            key={key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex size-24 items-center justify-center rounded-full border border-border bg-popover shadow-raised"
          >
            <span className="sr-only">{t("dealWon")}</span>
            <svg viewBox="0 0 52 52" className="size-14 text-success" aria-hidden>
              <motion.circle
                cx="26"
                cy="26"
                r="23"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
              <motion.path
                d="M15 27 l7 7 l15 -16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.25, delay: 0.3, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
