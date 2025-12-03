'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown } from 'lucide-react';

interface FilterOption {
  title: string;
  value: string | null;
  key: string;
  active?: boolean;
}

interface FilterDropdownProps {
  options: FilterOption[];
  onSelectionChange: (selected: FilterOption[]) => void;
  isMultiSelect?: boolean;
  isChecklist?: boolean;
  placeholder?: string;
  className?: string;
}

export function FilterDropdown({
  options,
  onSelectionChange,
  isMultiSelect = true,
  isChecklist = true,
  placeholder = 'Select filters',
  className = '',
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localOptions, setLocalOptions] = useState<FilterOption[]>(options);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalOptions(options.map(opt => ({ ...opt, active: opt.active ?? false })));
  }, [options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOptions = localOptions.filter((opt) => opt.active && opt.value !== null);

  const toggleOption = (option: FilterOption) => {
    const updated = localOptions.map((opt) => {
      if (opt.value === option.value) {
        return { ...opt, active: !opt.active };
      }
      if (!isMultiSelect && opt.active) {
        return { ...opt, active: false };
      }
      return opt;
    });
    setLocalOptions(updated);
    onSelectionChange(updated.filter((opt) => opt.active && opt.value !== null));
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:border-slate-600"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Filter className="h-4 w-4" />
        {selectedOptions.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1.5 text-xs text-white">
            {selectedOptions.length}
          </span>
        )}
        <span>{selectedOptions.length > 0 ? 'Filters' : placeholder}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
          {localOptions.map((option) => (
            <div
              key={option.value || 'all'}
              className={`flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-800 ${
                option.active ? 'bg-sky-500/10 text-sky-300' : 'text-slate-300'
              }`}
              onClick={() => toggleOption(option)}
            >
              {isChecklist && (
                <input
                  type="checkbox"
                  checked={option.active || false}
                  onChange={() => {}}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                />
              )}
              <span>{option.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

