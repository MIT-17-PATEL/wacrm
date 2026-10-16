/**
 * Best-effort country flag for a phone number, from its international
 * dialling prefix. Display-only — never used for validation or routing.
 *
 * Numbers are stored in E.164-ish form (digits, optional "+"). We match
 * the longest known prefix; unknown prefixes return null.
 */
const PREFIXES: Array<[string, string]> = [
  ["971", "AE"], ["966", "SA"], ["974", "QA"], ["968", "OM"], ["965", "KW"], ["973", "BH"],
  ["880", "BD"], ["977", "NP"], ["94", "LK"], ["92", "PK"], ["93", "AF"], ["960", "MV"],
  ["91", "IN"], ["65", "SG"], ["60", "MY"], ["62", "ID"], ["63", "PH"], ["66", "TH"],
  ["84", "VN"], ["86", "CN"], ["852", "HK"], ["81", "JP"], ["82", "KR"], ["61", "AU"],
  ["64", "NZ"], ["44", "GB"], ["353", "IE"], ["49", "DE"], ["33", "FR"], ["34", "ES"],
  ["39", "IT"], ["31", "NL"], ["32", "BE"], ["41", "CH"], ["46", "SE"], ["47", "NO"],
  ["45", "DK"], ["48", "PL"], ["351", "PT"], ["30", "GR"], ["90", "TR"], ["7", "RU"],
  ["20", "EG"], ["27", "ZA"], ["234", "NG"], ["254", "KE"], ["255", "TZ"], ["256", "UG"],
  ["212", "MA"], ["55", "BR"], ["52", "MX"], ["54", "AR"], ["57", "CO"], ["56", "CL"],
  ["51", "PE"], ["1", "US"],
];
// Longest prefixes first so "971" wins over "97…" and "1" goes last.
PREFIXES.sort((a, b) => b[0].length - a[0].length);

/** ISO-3166 alpha-2 → regional-indicator flag emoji ("IN" → 🇮🇳). */
function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function phoneCountry(phone: string | null | undefined): { iso: string; flag: string } | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const hit = PREFIXES.find(([p]) => digits.startsWith(p));
  return hit ? { iso: hit[1], flag: flagOf(hit[1]) } : null;
}
