import { ImageResponse } from "next/og";

import { BRAND_STATIC_COLORS, LOGO_PATH } from "@/lib/brand";

// Favicon — the flat brand mark (accent speech bubble) on an ink
// rounded square, matching <LogoMark /> in the sidebar. Next.js
// renders this at build time and injects <link rel="icon">.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
<rect width="32" height="32" rx="7" fill="${BRAND_STATIC_COLORS.ink}"/>
<g transform="translate(2.4 2) scale(0.86)"><path d="${LOGO_PATH}" fill="${BRAND_STATIC_COLORS.accent}"/></g>
</svg>`;

export default function Icon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        width={32}
        height={32}
        alt=""
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      />
    ),
    { ...size },
  );
}
