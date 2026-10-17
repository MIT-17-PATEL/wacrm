'use client';

import React, { useState, useEffect, useRef, useMemo, useId, useCallback } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAllCountries,
  getCountryMeta,
  getCountryName,
  getExamplePlaceholder,
  getWorkspaceDefaultCountry,
  isValidPhoneForCountry,
  normalizePhoneNumber,
  formatAsYouType,
  POPULAR_COUNTRY_CODES,
  type CountryCode,
} from '@/lib/phone-normalize';
import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js';

export interface PhoneInputProps {
  id?: string;
  value?: string;
  onChange?: (e164Value: string) => void;
  defaultCountry?: CountryCode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  'aria-describedby'?: string;
}

export function PhoneInput({
  id: explicitId,
  value = '',
  onChange,
  defaultCountry: propDefaultCountry,
  placeholder: customPlaceholder,
  disabled = false,
  required = false,
  className,
  autoFocus = false,
  onBlur,
  'aria-describedby': ariaDescribedBy,
}: PhoneInputProps) {
  const generatedId = useId();
  const inputId = explicitId || generatedId;

  // Initial country resolution: check value first, then prop, then workspace default
  const [country, setCountry] = useState<CountryCode>(() => {
    if (value) {
      const parsed = normalizePhoneNumber(value);
      if (parsed) return parsed.country;
    }
    return propDefaultCountry || getWorkspaceDefaultCountry();
  });

  // National formatted digits displayed in the input field
  const [nationalInput, setNationalInput] = useState<string>(() => {
    if (!value) return '';
    const parsed = normalizePhoneNumber(value, country);
    return parsed ? parsed.formattedNational : value.replace(/^\+/, '');
  });

  // Synchronize incoming value if changed externally (e.g. form reset or loading existing contact)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value === '') {
      setNationalInput('');
    } else {
      const parsed = normalizePhoneNumber(value, country);
      if (parsed) {
        if (parsed.country !== country) {
          setCountry(parsed.country);
        }
        setNationalInput(parsed.formattedNational);
      }
    }
  }

  const [touched, setTouched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allCountries = useMemo(() => getAllCountries(), []);
  const currentMeta = useMemo(() => getCountryMeta(country), [country]);

  // Filter countries by search query
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return allCountries;

    return allCountries.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const codeMatch = c.code.toLowerCase().includes(q);
      const dialMatch = c.callingCode.replace('+', '').includes(q);
      return nameMatch || codeMatch || dialMatch;
    });
  }, [allCountries, search]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [dropdownOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!dropdownOpen || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-country-item]');
    const activeItem = items[highlightedIndex] as HTMLElement | undefined;
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, dropdownOpen]);

  // Check validity
  const isValid = useMemo(() => {
    const digits = nationalInput.replace(/\D/g, '');
    if (!digits) return true; // empty is handled by required check
    return isValidPhoneForCountry(digits, country);
  }, [nationalInput, country]);

  const showInlineError = touched && nationalInput.replace(/\D/g, '').length > 0 && !isValid;
  const countryName = getCountryName(country);

  // Compute placeholder example number
  const placeholderText = customPlaceholder || getExamplePlaceholder(country);

  const emitChange = useCallback(
    (formattedNational: string, targetCountry: CountryCode) => {
      const cleanDigits = formattedNational.replace(/\D/g, '');
      if (!cleanDigits) {
        onChange?.('');
        return;
      }

      // Try generating canonical E.164
      let callingCode = '';
      try {
        callingCode = getCountryCallingCode(targetCountry);
      } catch {
        callingCode = '91';
      }

      const parsed = parsePhoneNumberFromString(cleanDigits, targetCountry);
      const e164 = parsed && parsed.isValid() ? parsed.format('E.164') : `+${callingCode}${cleanDigits}`;
      onChange?.(e164);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setTouched(true);

    // Check if the user pasted or typed a full international string (e.g. +91 98765 43210 or 919876543210)
    if (rawVal.startsWith('+') || (rawVal.replace(/\D/g, '').length > 10 && !rawVal.includes(' '))) {
      const detected = normalizePhoneNumber(rawVal, country);
      if (detected) {
        setCountry(detected.country);
        setNationalInput(detected.formattedNational);
        emitChange(detected.formattedNational, detected.country);
        return;
      }
    }

    const formatted = formatAsYouType(rawVal, country);
    setNationalInput(formatted);
    emitChange(formatted, country);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const detected = normalizePhoneNumber(pasted, country);
    if (detected) {
      e.preventDefault();
      setTouched(true);
      setCountry(detected.country);
      setNationalInput(detected.formattedNational);
      emitChange(detected.formattedNational, detected.country);
    }
  };

  const selectCountry = (newCountry: CountryCode) => {
    setCountry(newCountry);
    setDropdownOpen(false);

    // Re-format existing digits with new country
    const cleanDigits = nationalInput.replace(/\D/g, '');
    const formatted = cleanDigits ? formatAsYouType(cleanDigits, newCountry) : '';
    setNationalInput(formatted);
    emitChange(formatted, newCountry);

    // Focus phone field
    setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 50);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredCountries.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredCountries[highlightedIndex];
      if (target) {
        selectCountry(target.code);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDropdownOpen(false);
      phoneInputRef.current?.focus();
    }
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div
        className={cn(
          'relative flex items-center rounded-lg border bg-muted/60 transition-colors',
          'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
          showInlineError
            ? 'border-danger focus-within:border-danger focus-within:ring-danger'
            : 'border-border',
          disabled && 'opacity-50 pointer-events-none',
          className
        )}
      >
        {/* Country Selector Dropdown Trigger Button */}
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setDropdownOpen((prev) => {
                if (!prev) {
                  setSearch('');
                  setHighlightedIndex(0);
                }
                return !prev;
              });
            }
          }}
          disabled={disabled}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          aria-label={`Select country, currently ${currentMeta.name} ${currentMeta.callingCode}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-l-lg border-r border-border bg-transparent px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer shrink-0 select-none"
        >
          <span className="text-base leading-none" role="img" aria-label={currentMeta.name}>
            {currentMeta.flag}
          </span>
          <span className="tabular-nums font-mono text-xs text-foreground font-semibold">
            {currentMeta.callingCode}
          </span>
          <ChevronDown
            className={cn('size-3.5 text-muted-foreground transition-transform duration-200', dropdownOpen && 'rotate-180')}
          />
        </button>

        {/* Number Input Field */}
        <input
          ref={phoneInputRef}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalInput}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onBlur={() => {
            setTouched(true);
            onBlur?.();
          }}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholderText}
          aria-invalid={showInlineError}
          aria-describedby={ariaDescribedBy}
          className="h-9 w-full min-w-0 bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />

        {/* Country Selector Dropdown Popover */}
        {dropdownOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Country selector"
            className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
          >
            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search country or code..."
                className="h-8 w-full rounded-md border border-border bg-muted/60 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Countries List */}
            <ul
              ref={listRef}
              role="listbox"
              aria-label="Countries"
              className="max-h-60 overflow-y-auto overscroll-contain py-1 text-xs"
            >
              {filteredCountries.length === 0 ? (
                <li className="py-4 text-center text-xs text-muted-foreground">No country found</li>
              ) : (
                filteredCountries.map((c, index) => {
                  const isSelected = c.code === country;
                  const isHighlighted = index === highlightedIndex;
                  const isPopularBoundary = !search && index === POPULAR_COUNTRY_CODES.length - 1;

                  return (
                    <React.Fragment key={c.code}>
                      <li
                        role="option"
                        aria-selected={isSelected}
                        data-country-item
                        onClick={() => selectCountry(c.code)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors',
                          isHighlighted ? 'bg-accent text-accent-foreground' : 'text-foreground',
                          isSelected && 'font-semibold text-primary'
                        )}
                      >
                        <span className="text-base shrink-0 leading-none" role="img" aria-hidden="true">
                          {c.flag}
                        </span>
                        <span className="truncate flex-1">{c.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums">
                          {c.callingCode}
                        </span>
                        {isSelected && <Check className="size-3.5 text-primary shrink-0 ml-1" />}
                      </li>
                      {isPopularBoundary && (
                        <li className="my-1 border-t border-border" role="separator" />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Inline Validation Error */}
      {showInlineError && (
        <p className="text-xs text-danger font-medium animate-in fade-in-0 slide-in-from-top-1 duration-150">
          Enter a valid number for {countryName}
        </p>
      )}
    </div>
  );
}
