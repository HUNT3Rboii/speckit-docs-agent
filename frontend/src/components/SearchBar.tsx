import { Search, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name, for reuse over lists that aren't artifacts. */
  ariaLabel?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search by title or source path...',
  ariaLabel = 'Search artifacts',
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value);
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  const debouncedValue = useDebounce(inputValue, 300);
  const isFirstRender = useRef(true);

  // Sync internal state when the external value prop changes. Adjusting during
  // render rather than in an effect keeps the input from briefly showing the
  // stale value, and re-runs this component only - not its children.
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setInputValue(value);
  }

  useEffect(() => {
    // Skip the first render to avoid calling onChange on mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChange(debouncedValue);
  }, [debouncedValue, onChange]);

  const handleClear = () => {
    setInputValue('');
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label={ariaLabel}
      />
      {inputValue && (
        <button
          onClick={handleClear}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
