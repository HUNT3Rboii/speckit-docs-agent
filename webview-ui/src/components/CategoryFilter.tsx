import { Button } from './ui/button';
import { getCategoryBadgeClasses, type ArtifactCategory } from '../utils/categoryColors';

interface CategoryFilterProps {
  selectedCategories: Set<string>;
  onCategoryToggle: (category: string) => void;
  categoryCounts?: Record<string, number>;
}

const CATEGORIES: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];

const CATEGORY_LABELS: Record<ArtifactCategory | 'all', string> = {
  all: 'Show all categories',
  spec: 'Filter by Spec',
  plan: 'Filter by Plan',
  task: 'Filter by Task',
  constitution: 'Filter by Constitution',
  other: 'Filter by Other',
};

export function CategoryFilter({ selectedCategories, onCategoryToggle, categoryCounts }: CategoryFilterProps) {
  const isAllSelected = selectedCategories.size === 0;

  // Calculate total count
  const totalCount = categoryCounts
    ? Object.values(categoryCounts).reduce((sum, count) => sum + count, 0)
    : undefined;

  const handleAllClick = () => {
    onCategoryToggle('all');
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      <Button
        variant={isAllSelected ? 'default' : 'outline'}
        size="sm"
        onClick={handleAllClick}
        aria-label={CATEGORY_LABELS.all}
        aria-pressed={isAllSelected}
        className="min-h-[44px]"
      >
        All
        {totalCount !== undefined && <span className="ml-1 opacity-70">({totalCount})</span>}
      </Button>
      {CATEGORIES.map((category) => {
        const isSelected = selectedCategories.has(category);
        const count = categoryCounts?.[category];
        const badgeClasses = getCategoryBadgeClasses(category);

        return (
          <Button
            key={category}
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => onCategoryToggle(category)}
            aria-label={CATEGORY_LABELS[category]}
            aria-pressed={isSelected}
            className={isSelected ? `${badgeClasses} min-h-[44px]` : 'min-h-[44px]'}
          >
            {category}
            {count !== undefined && count > 0 && <span className="ml-1 opacity-70">({count})</span>}
          </Button>
        );
      })}
    </div>
  );
}
