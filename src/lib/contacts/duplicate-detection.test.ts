import { describe, it, expect, vi } from 'vitest';
import {
  findExistingContact,
  isExactMatch,
  normalizeKey,
  type ExistingContact,
} from './dedupe';
import { normalizePhoneNumber } from '@/lib/phone-normalize';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('duplicate detection with E.164 numbers', () => {
  it('detects duplicate when newly entered number in national format matches existing E.164 contact', () => {
    const existing: ExistingContact = {
      id: 'c-1',
      phone: '+919876543210',
      name: 'John Doe',
    };

    // User types in national format for India
    const inputFormatted = '98765 43210';
    const normalized = normalizePhoneNumber(inputFormatted, 'IN');
    expect(normalized).not.toBeNull();
    expect(normalized?.e164).toBe('+919876543210');

    // Exact match is verified against existing E.164
    expect(isExactMatch(existing, normalized!.e164)).toBe(true);
    expect(normalizeKey(existing.phone)).toBe(normalizeKey(normalized!.e164));
  });

  it('detects duplicate across US international and formatted inputs', () => {
    const existing: ExistingContact = {
      id: 'c-2',
      phone: '+14155552671',
      name: 'Alice Smith',
    };

    const inputPasted = '+1 (415) 555-2671';
    const normalized = normalizePhoneNumber(inputPasted, 'IN');
    expect(normalized?.e164).toBe('+14155552671');
    expect(isExactMatch(existing, normalized!.e164)).toBe(true);
  });

  it('findExistingContact returns the matching contact record', async () => {
    const fakeContacts = [
      { id: 'c-10', phone: '+919876543210', name: 'Ravi Kumar' },
      { id: 'c-11', phone: '+14155551234', name: 'Bob' },
    ];

    const mockDb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            like: vi.fn(async () => ({ data: fakeContacts, error: null })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    const hit = await findExistingContact(mockDb, 'acc-1', '+91 98765 43210');
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe('c-10');
    expect(hit?.name).toBe('Ravi Kumar');
  });

  it('distinguishes different phone numbers as non-duplicates', () => {
    const existing: ExistingContact = {
      id: 'c-3',
      phone: '+919876543210',
      name: 'User 1',
    };

    const differentNumber = normalizePhoneNumber('9876543211', 'IN');
    expect(isExactMatch(existing, differentNumber!.e164)).toBe(false);
  });
});
