import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePhone,
  parseInternationalPhone,
  phonesMatch,
} from "@/lib/whatsapp/phone-utils";
import { normalizePhoneNumber, type CountryCode } from "@/lib/phone-normalize";

/**
 * Contact de-duplication helpers, shared by the WhatsApp webhook, the
 * manual contact form, and CSV import so all paths agree on what
 * "same number" means (issue #212).
 *
 * The canonical key is `normalizePhone` (digits-only) — the same form
 * the DB stores in the generated `contacts.phone_normalized` column
 * and enforces unique per account. `phonesMatch` adds trunk-prefix
 * tolerance (last-8-digit match) for the softer "possible duplicate"
 * surfaces.
 */

/** Canonical de-dup key for a phone string (digits only). */
export function normalizeKey(phone: string): string {
  return normalizePhone(phone);
}

/** Minimal shape we need back from a contacts lookup. */
export interface ExistingContact {
  id: string;
  phone: string;
  name?: string | null;
  [key: string]: unknown;
}

/**
 * Find an existing contact in `accountId` whose phone matches `phone`,
 * or null. Pre-filters in SQL by the last-8-digit suffix (so we don't
 * pull every contact), then applies the strict `phonesMatch` in JS on
 * the small candidate set — the exact approach the webhook has used.
 */
export async function findExistingContact(
  db: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<ExistingContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .like("phone", `%${suffix}`);

  if (error || !data) return null;

  return (
    (data as ExistingContact[]).find((c) => phonesMatch(c.phone, phone)) ?? null
  );
}

/**
 * True when an existing contact is an *exact* normalized match for
 * `phone` (vs only a fuzzy trunk-variant match). The form hard-blocks
 * exact matches but only warns on fuzzy ones.
 */
export function isExactMatch(existing: ExistingContact, phone: string): boolean {
  return normalizeKey(existing.phone) === normalizeKey(phone);
}

/**
 * True for a Postgres unique-constraint violation (SQLSTATE 23505).
 * Used as the backstop when the DB unique index rejects a racing or
 * format-equal insert that slipped past the in-app check.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}


export interface DedupeOptions {
  /** Default country code used when phone lacks a country dial code. Defaults to 'IN'. */
  defaultCountry?: CountryCode;
  /** Strictly require leading '+' and country code (issue #586 for broadcast CSV). */
  requireLeadingPlus?: boolean;
  /** Preserve original string in row.phone instead of replacing with canonical E.164. */
  preserveOriginalPhone?: boolean;
}

/**
 * De-duplicate parsed CSV rows by normalized phone, keeping the first
 * occurrence of each. Rows whose phone cannot be normalized to a valid
 * number are dropped and counted separately as `invalid`.
 *
 * Numbers without a country code use `defaultCountry` (defaults to 'IN').
 * Stored rows have their `phone` field normalized to canonical E.164 format
 * unless `preserveOriginalPhone: true` is configured.
 */
export function dedupeByPhone<T extends { phone: string }>(
  rows: T[],
  optionsOrCountry: CountryCode | DedupeOptions = "IN"
): { unique: T[]; duplicates: number; invalid: number } {
  const options: DedupeOptions =
    typeof optionsOrCountry === "string"
      ? { defaultCountry: optionsOrCountry }
      : optionsOrCountry;

  const defaultCountry = options.defaultCountry ?? "IN";
  const requireLeadingPlus = options.requireLeadingPlus ?? false;
  const preserveOriginalPhone = options.preserveOriginalPhone ?? false;

  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;
  let invalid = 0;

  for (const row of rows) {
    if (requireLeadingPlus) {
      const key = parseInternationalPhone(row.phone);
      if (!key) {
        invalid++;
        continue;
      }
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      if (!preserveOriginalPhone) {
        row.phone = `+${key}`;
      }
      unique.push(row);
      continue;
    }

    const normalized = normalizePhoneNumber(row.phone, defaultCountry);
    if (!normalized) {
      invalid++;
      continue;
    }
    const key = normalizeKey(normalized.e164);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    // Persist canonical E.164 format
    if (!preserveOriginalPhone) {
      row.phone = normalized.e164;
    }
    unique.push(row);
  }

  return { unique, duplicates, invalid };
}
