/**
 * Artifact category types
 */
export type ArtifactCategory = 'spec' | 'plan' | 'task' | 'constitution' | 'other';

/**
 * Color configuration for artifact categories
 * Includes Tailwind CSS color classes for badges
 */
export interface CategoryColorConfig {
  badge: string; // Tailwind classes for badge styling
  text: string;  // Color name for display
  hex: string;   // Hex color code
}

/**
 * Color mapping for artifact types
 * - spec: blue
 * - plan: green
 * - task: orange
 * - constitution: purple
 * - other: gray
 */
export const categoryColors: Record<ArtifactCategory, CategoryColorConfig> = {
  spec: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    text: 'blue',
    hex: '#3b82f6',
  },
  plan: {
    badge: 'bg-green-100 text-green-800 border-green-200',
    text: 'green',
    hex: '#22c55e',
  },
  task: {
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    text: 'orange',
    hex: '#f97316',
  },
  constitution: {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    text: 'purple',
    hex: '#a855f7',
  },
  other: {
    badge: 'bg-gray-100 text-gray-800 border-gray-200',
    text: 'gray',
    hex: '#6b7280',
  },
};

/**
 * Gets the color configuration for a specific artifact category
 * 
 * @param category The artifact category
 * @returns Color configuration object
 */
export function getCategoryColor(category: ArtifactCategory): CategoryColorConfig {
  return categoryColors[category] || categoryColors.other;
}

/**
 * Gets the Tailwind badge classes for a specific artifact category
 * 
 * @param category The artifact category
 * @returns Tailwind CSS classes string for badge styling
 */
export function getCategoryBadgeClasses(category: ArtifactCategory): string {
  return getCategoryColor(category).badge;
}

/**
 * Gets the hex color code for a specific artifact category
 * 
 * @param category The artifact category
 * @returns Hex color code
 */
export function getCategoryHexColor(category: ArtifactCategory): string {
  return getCategoryColor(category).hex;
}

/**
 * Gets the color name for a specific artifact category
 * 
 * @param category The artifact category
 * @returns Color name as string
 */
export function getCategoryColorName(category: ArtifactCategory): string {
  return getCategoryColor(category).text;
}
