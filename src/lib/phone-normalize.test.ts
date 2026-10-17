import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  isValidPhoneForCountry,
  formatAsYouType,
  getExamplePlaceholder,
  getAllCountries,
  POPULAR_COUNTRY_CODES,
  flagOf,
  getCountryName,
} from './phone-normalize';

describe('phone-normalize', () => {
  describe('Indian phone normalization', () => {
    it('normalizes 10-digit Indian number without country code using default IN', () => {
      const res = normalizePhoneNumber('9876543210', 'IN');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+919876543210');
      expect(res?.country).toBe('IN');
      expect(res?.nationalNumber).toBe('9876543210');
    });

    it('normalizes Indian number with explicit +91 and spaces', () => {
      const res = normalizePhoneNumber('+91 98765 43210', 'US');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+919876543210');
      expect(res?.country).toBe('IN');
    });

    it('normalizes Indian number with 91 prefix without plus', () => {
      const res = normalizePhoneNumber('919876543210', 'US');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+919876543210');
      expect(res?.country).toBe('IN');
    });
  });

  describe('US phone normalization', () => {
    it('normalizes formatted US number with +1', () => {
      const res = normalizePhoneNumber('+1 (415) 555-2671', 'IN');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+14155552671');
      expect(res?.country).toBe('US');
      expect(res?.nationalNumber).toBe('4155552671');
    });

    it('normalizes 10-digit US number with default country US', () => {
      const res = normalizePhoneNumber('4155552671', 'US');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+14155552671');
      expect(res?.country).toBe('US');
    });

    it('normalizes 11-digit US number starting with 1 with default country US', () => {
      const res = normalizePhoneNumber('14155552671', 'US');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+14155552671');
      expect(res?.country).toBe('US');
    });

    it('normalizes full US number with + even when default country is IN', () => {
      const res = normalizePhoneNumber('+14155552671', 'IN');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+14155552671');
      expect(res?.country).toBe('US');
    });
  });

  describe('Pasted formats', () => {
    it('handles noisy pasted formats with dots, dashes, parentheses', () => {
      const res = normalizePhoneNumber('  +971 (50) 123-4567  ', 'IN');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+971501234567');
      expect(res?.country).toBe('AE');
    });

    it('handles UK number pasted with international prefix', () => {
      const res = normalizePhoneNumber('+44 7400 123456', 'IN');
      expect(res).not.toBeNull();
      expect(res?.e164).toBe('+447400123456');
      expect(res?.country).toBe('GB');
    });
  });

  describe('Invalid phone numbers', () => {
    it('rejects too-short strings', () => {
      expect(normalizePhoneNumber('12345', 'IN')).toBeNull();
      expect(normalizePhoneNumber('abc', 'IN')).toBeNull();
      expect(normalizePhoneNumber('', 'IN')).toBeNull();
      expect(normalizePhoneNumber(null, 'IN')).toBeNull();
    });

    it('validates phone for specific country accurately', () => {
      expect(isValidPhoneForCountry('9876543210', 'IN')).toBe(true);
      expect(isValidPhoneForCountry('98765 43210', 'IN')).toBe(true);
      expect(isValidPhoneForCountry('12345', 'IN')).toBe(false);
      expect(isValidPhoneForCountry('4155552671', 'US')).toBe(true);
      expect(isValidPhoneForCountry('123', 'US')).toBe(false);
    });
  });

  describe('Country metadata & Popular pinned list', () => {
    it('pins popular countries at top in expected order', () => {
      const countries = getAllCountries();
      const topCodes = countries.slice(0, 7).map((c) => c.code);
      expect(topCodes).toEqual(['IN', 'AE', 'US', 'GB', 'SA', 'CA', 'AU']);
      expect(POPULAR_COUNTRY_CODES).toEqual(topCodes);
    });

    it('provides flag emoji for ISO country code', () => {
      expect(flagOf('IN')).toBe('🇮🇳');
      expect(flagOf('US')).toBe('🇺🇸');
      expect(flagOf('AE')).toBe('🇦🇪');
    });

    it('returns readable country names', () => {
      expect(getCountryName('IN')).toBe('India');
      expect(getCountryName('US')).toBe('United States');
      expect(getCountryName('AE')).toBe('United Arab Emirates');
    });
  });

  describe('Formatting as-you-type and placeholders', () => {
    it('formats Indian number as typed', () => {
      expect(formatAsYouType('9876543210', 'IN')).toBe('98765 43210');
    });

    it('returns example placeholder', () => {
      const placeholder = getExamplePlaceholder('IN');
      expect(placeholder).toBeTruthy();
      expect(placeholder.length).toBeGreaterThan(5);
    });
  });
});
