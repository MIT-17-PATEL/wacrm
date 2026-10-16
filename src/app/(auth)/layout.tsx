import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

/** Plain background with the logo top-left. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-background">
      <div className="absolute top-5 left-5 z-10 sm:top-7 sm:left-8">
        <Logo />
      </div>
      {children}
    </div>
  );
}
