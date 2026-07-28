# Utility Functions

This directory contains utility functions and helpers used throughout the PDF Visualization Frontend application.

## Contents

### `dateFormat.ts`
Date and time formatting utilities using `date-fns`.

**Functions:**
- `formatRelativeTime(date)` - Formats date as relative time (e.g., "2 hours ago", "yesterday", "March 15, 2024")
- `formatDate(date, format)` - Formats date with custom format string (default: "MMMM d, yyyy")
- `formatShortTime(date)` - Formats date in short format (e.g., "2h ago", "Mar 15")

**Example Usage:**
```typescript
import { formatRelativeTime, formatDate, formatShortTime } from '@/utils';

// Relative time
formatRelativeTime('2024-03-15T10:30:00Z'); // "2 hours ago" (if current time is close)

// Full date
formatDate('2024-03-15T10:30:00Z'); // "March 15, 2024"

// Custom format
formatDate('2024-03-15T10:30:00Z', 'yyyy-MM-dd'); // "2024-03-15"

// Short format
formatShortTime('2024-03-15T10:30:00Z'); // "Mar 15"
```

### `categoryColors.ts`
Color mapping and styling for artifact categories.

**Types:**
- `ArtifactCategory` - Union type: 'spec' | 'plan' | 'task' | 'constitution' | 'other'
- `CategoryColorConfig` - Interface with badge classes, text color, and hex code

**Color Scheme:**
- **spec**: blue (#3b82f6)
- **plan**: green (#22c55e)
- **task**: orange (#f97316)
- **constitution**: purple (#a855f7)
- **other**: gray (#6b7280)

**Functions:**
- `getCategoryColor(category)` - Returns full color configuration
- `getCategoryBadgeClasses(category)` - Returns Tailwind CSS classes for badges
- `getCategoryHexColor(category)` - Returns hex color code
- `getCategoryColorName(category)` - Returns color name

**Example Usage:**
```typescript
import { getCategoryBadgeClasses, getCategoryHexColor } from '@/utils';

// Get badge classes for shadcn/ui Badge component
const badgeClasses = getCategoryBadgeClasses('spec'); // "bg-blue-100 text-blue-800 border-blue-200"

// Get hex color for custom styling
const hexColor = getCategoryHexColor('task'); // "#f97316"
```

### `pathTruncate.ts`
File path truncation utilities for displaying long paths in limited space.

**Functions:**
- `truncatePath(path, maxLength)` - Truncates path with ellipsis in the middle, preserving filename
- `truncatePathSegments(path, segments)` - Keeps only last N segments of the path
- `getFileName(path)` - Extracts filename from path
- `getDirPath(path)` - Extracts directory path without filename

**Example Usage:**
```typescript
import { truncatePath, truncatePathSegments, getFileName } from '@/utils';

// Truncate long path (default max 50 chars)
truncatePath('/very/long/path/to/document/spec.md', 30);
// Result: "/very/long/.../spec.md"

// Keep last 3 segments
truncatePathSegments('/a/b/c/d/e/file.md', 3);
// Result: ".../d/e/file.md"

// Extract filename
getFileName('/path/to/document.md'); // "document.md"
```

## Hooks

### `useDebounce.ts`
Custom React hook for debouncing rapidly changing values.

**Parameters:**
- `value` - The value to debounce (generic type)
- `delay` - Delay in milliseconds (default: 300ms)

**Returns:** Debounced value

**Example Usage:**
```typescript
import { useDebounce } from '@/hooks';

function SearchBar() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // This effect only runs when debounced value changes
  useEffect(() => {
    if (debouncedSearchTerm) {
      performSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search artifacts..."
    />
  );
}
```

## Import Patterns

All utilities can be imported from the main utils index:

```typescript
// Individual imports
import { formatRelativeTime } from '@/utils/dateFormat';
import { getCategoryBadgeClasses } from '@/utils/categoryColors';
import { truncatePath } from '@/utils/pathTruncate';

// Or from the main index
import { 
  formatRelativeTime, 
  getCategoryBadgeClasses, 
  truncatePath 
} from '@/utils';
```

## Testing

Each utility module should have corresponding unit tests. See `src/utils/*.test.ts` files for test coverage.

## Requirements Mapping

These utilities satisfy the following requirements from the spec:

- **Requirement 4.3**: Human-readable timestamps (dateFormat.ts)
- **Requirement 4.4**: Path truncation with tooltips (pathTruncate.ts)
- **Requirement 9.2**: Debounced search input (useDebounce.ts)
- **Requirement 4.2**: Color-coded category badges (categoryColors.ts)
