import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  type CountryCode,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';
import { getExampleNumber } from 'libphonenumber-js';

export type { CountryCode };

export interface CountryMeta {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
}

/** ISO-3166 alpha-2 → regional indicator flag emoji ("IN" → 🇮🇳). */
export function flagOf(iso: string): string {
  if (!iso || iso.length !== 2) return '🌐';
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Region display name formatter (English fallback). */
const displayNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export function getCountryName(iso: CountryCode): string {
  try {
    return displayNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/** Popular countries pinned at the top: India, UAE, USA, UK, Saudi Arabia, Canada, Australia */
export const POPULAR_COUNTRY_CODES: readonly CountryCode[] = [
  'IN', // India (+91)
  'AE', // UAE (+971)
  'US', // USA (+1)
  'GB', // UK (+44)
  'SA', // Saudi Arabia (+966)
  'CA', // Canada (+1)
  'AU', // Australia (+61)
];

const POPULAR_SET = new Set<string>(POPULAR_COUNTRY_CODES);

/**
 * Build cached country metadata list.
 * Pinned popular countries first, followed by remaining countries sorted alphabetically by name.
 */
let _allCountriesCache: CountryMeta[] | null = null;

export function getAllCountries(): CountryMeta[] {
  if (_allCountriesCache) return _allCountriesCache;

  const rawList: CountryMeta[] = getCountries().map((code) => {
    let callingCode = '';
    try {
      callingCode = '+' + getCountryCallingCode(code);
    } catch {
      callingCode = '';
    }
    return {
      code,
      name: getCountryName(code),
      callingCode,
      flag: flagOf(code),
    };
  });

  const popular = POPULAR_COUNTRY_CODES.map((code) =>
    rawList.find((c) => c.code === code)
  ).filter((c): c is CountryMeta => !!c);

  const others = rawList
    .filter((c) => !POPULAR_SET.has(c.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  _allCountriesCache = [...popular, ...others];
  return _allCountriesCache;
}

export function getCountryMeta(code: CountryCode): CountryMeta {
  const all = getAllCountries();
  const hit = all.find((c) => c.code === code);
  if (hit) return hit;
  let callingCode = '';
  try {
    callingCode = '+' + getCountryCallingCode(code);
  } catch {
    callingCode = '';
  }
  return {
    code,
    name: getCountryName(code),
    callingCode,
    flag: flagOf(code),
  };
}

/**
 * Get workspace default country.
 * Checks localStorage preference if client-side, falls back to 'IN' (+91).
 */
export function getWorkspaceDefaultCountry(): CountryCode {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('wacrm_workspace_country');
      if (stored && stored.length === 2) {
        return stored.toUpperCase() as CountryCode;
      }
    } catch {
      // localStorage may be disabled
    }
  }
  return 'IN';
}

/**
 * Set workspace default country preference.
 */
export function setWorkspaceDefaultCountry(country: CountryCode): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('wacrm_workspace_country', country);
    } catch {
      // ignore
    }
  }
}

export interface NormalizedPhoneResult {
  /** Canonical E.164 string with leading "+", e.g. "+919876543210" */
  e164: string;
  /** ISO 3166-1 alpha-2 country code */
  country: CountryCode;
  /** Digits-only national number */
  nationalNumber: string;
  /** Formatted national number, e.g. "98765 43210" */
  formattedNational: string;
}

/**
 * Normalise any raw phone input to E.164 and country metadata.
 * Handles:
 *   - International numbers with "+" (+91 98765 43210, +1-415-555-1212)
 *   - International numbers without "+" (919876543210, 14155551212)
 *   - National numbers using defaultCountry (9876543210 with 'IN' → +919876543210)
 *   - Formatted national inputs ((415) 555-1212 with 'US' → +14155551212)
 */
export function normalizePhoneNumber(
  raw: string | null | undefined,
  defaultCountry: CountryCode = 'IN'
): NormalizedPhoneResult | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Direct parse if starts with "+"
  if (trimmed.startsWith('+')) {
    const p = parsePhoneNumberFromString(trimmed);
    if (p && (p.isValid() || p.isPossible())) {
      const country = (p.country || defaultCountry) as CountryCode;
      return {
        e164: p.format('E.164'),
        country,
        nationalNumber: p.nationalNumber,
        formattedNational: new AsYouType(country).input(p.nationalNumber),
      };
    }
  }

  // 2. Parse using defaultCountry (for national digits)
  const pDef = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (pDef && (pDef.isValid() || pDef.isPossible())) {
    const country = (pDef.country || defaultCountry) as CountryCode;
    return {
      e164: pDef.format('E.164'),
      country,
      nationalNumber: pDef.nationalNumber,
      formattedNational: new AsYouType(country).input(pDef.nationalNumber),
    };
  }

  // 3. Try prepending "+" for numbers entered with full dial code but missing "+"
  const pPlus = parsePhoneNumberFromString('+' + trimmed);
  if (pPlus && (pPlus.isValid() || pPlus.isPossible())) {
    const country = (pPlus.country || defaultCountry) as CountryCode;
    return {
      e164: pPlus.format('E.164'),
      country,
      nationalNumber: pPlus.nationalNumber,
      formattedNational: new AsYouType(country).input(pPlus.nationalNumber),
    };
  }

  return null;
}

/**
 * Validate phone input for a specific country.
 */
export function isValidPhoneForCountry(
  nationalNumberOrE164: string,
  country: CountryCode
): boolean {
  if (!nationalNumberOrE164?.trim()) return false;
  try {
    return isValidPhoneNumber(nationalNumberOrE164, country);
  } catch {
    return false;
  }
}

/**
 * Format national digits as the user types.
 */
export function formatAsYouType(digits: string, country: CountryCode): string {
  const cleanDigits = digits.replace(/\D/g, '');
  if (!cleanDigits) return '';
  return new AsYouType(country).input(cleanDigits);
}

/**
 * Get an example formatted national number for placeholder.
 */
export function getExamplePlaceholder(country: CountryCode): string {
  try {
    const ex = getExampleNumber(country, examples);
    if (ex) {
      return new AsYouType(country).input(ex.nationalNumber) || ex.nationalNumber;
    }
  } catch {
    // fallback
  }

  switch (country) {
    case 'IN':
      return '98765 43210';
    case 'US':
    case 'CA':
      return '(201) 555-0123';
    case 'GB':
      return '7400 123456';
    case 'AE':
      return '50 123 4567';
    case 'SA':
      return '51 234 5678';
    case 'AU':
      return '412 345 678';
    default:
      return '98765 43210';
  }
}
