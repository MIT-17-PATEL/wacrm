/**
 * Product branding — the one place to rename the product.
 *
 * Used by page metadata, the sidebar logo and the favicon. Translated
 * sentences that mention the product (messages/*.json) spell the name
 * out, so a rename also needs a find-and-replace there.
 */
export const BRAND = {
  name: "Neno Connect",
  shortName: "Neno",
} as const;

/**
 * Static colours for build-time brand images (favicon) where CSS
 * variables can't reach. Mirror the default green accent's --primary
 * and the dark --background in globals.css.
 */
export const BRAND_STATIC_COLORS = {
  accent: "#2f9e6e",
  ink: "#0b0c0e",
} as const;

/**
 * The brand mark: a single flat speech-bubble shape. Used by
 * <LogoMark /> and the favicon (src/app/icon.tsx).
 */
export const LOGO_PATH =
  "M15.5 4.5C9.15 4.5 4 9.16 4 14.9c0 3.05 1.42 5.8 3.7 7.7L6.9 27.5l5.02-2.38c1.13.29 2.33.45 3.58.45 6.35 0 11.5-4.66 11.5-10.4S21.85 4.5 15.5 4.5Z";
