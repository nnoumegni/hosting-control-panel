'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { TOPUP_CURRENCIES } from '../_constants/theme-categories';

interface CurrencySelectorProps {
  value: string;
  onChange: (currency: string) => void;
  currencies?: string[];
  disabled?: boolean;
}

export function CurrencySelector({
  value,
  onChange,
  currencies = TOPUP_CURRENCIES,
  disabled = false,
}: CurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-r-md border-l-0 border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{value || 'Select currency'}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
          {currencies.map((currency) => (
            <div
              key={currency}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-slate-800 ${
                value === currency ? 'bg-sky-500/10 text-sky-300' : 'text-slate-300'
              }`}
              onClick={() => {
                onChange(currency);
                setIsOpen(false);
              }}
            >
              {currency}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

