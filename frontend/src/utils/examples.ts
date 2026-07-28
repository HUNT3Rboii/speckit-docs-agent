/**
 * Example usage of utility functions
 * This file demonstrates how to use the utilities and can be used for manual testing
 */

import { formatRelativeTime, formatDate, formatShortTime } from './dateFormat';
import { 
  getCategoryColor, 
  getCategoryBadgeClasses, 
  getCategoryHexColor,
  type ArtifactCategory 
} from './categoryColors';
import { 
  truncatePath, 
  truncatePathSegments, 
  getFileName, 
  getDirPath 
} from './pathTruncate';

// Date formatting examples
export const dateExamples = {
  now: new Date().toISOString(),
  today: new Date().toISOString(),
  yesterday: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  lastWeek: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  lastMonth: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  
  formatted: {
    relative: formatRelativeTime(new Date().toISOString()),
    full: formatDate(new Date().toISOString()),
    custom: formatDate(new Date().toISOString(), 'yyyy-MM-dd HH:mm'),
    short: formatShortTime(new Date().toISOString()),
  }
};

// Category color examples
export const categoryExamples: Record<ArtifactCategory, any> = {
  spec: {
    type: 'spec',
    color: getCategoryColor('spec'),
    badgeClasses: getCategoryBadgeClasses('spec'),
    hexColor: getCategoryHexColor('spec'),
  },
  plan: {
    type: 'plan',
    color: getCategoryColor('plan'),
    badgeClasses: getCategoryBadgeClasses('plan'),
    hexColor: getCategoryHexColor('plan'),
  },
  task: {
    type: 'task',
    color: getCategoryColor('task'),
    badgeClasses: getCategoryBadgeClasses('task'),
    hexColor: getCategoryHexColor('task'),
  },
  constitution: {
    type: 'constitution',
    color: getCategoryColor('constitution'),
    badgeClasses: getCategoryBadgeClasses('constitution'),
    hexColor: getCategoryHexColor('constitution'),
  },
  other: {
    type: 'other',
    color: getCategoryColor('other'),
    badgeClasses: getCategoryBadgeClasses('other'),
    hexColor: getCategoryHexColor('other'),
  },
};

// Path truncation examples
export const pathExamples = {
  short: {
    original: 'src/App.tsx',
    truncated: truncatePath('src/App.tsx', 50),
    segments: truncatePathSegments('src/App.tsx', 3),
    filename: getFileName('src/App.tsx'),
    dirPath: getDirPath('src/App.tsx'),
  },
  medium: {
    original: 'frontend/src/components/ArtifactCard.tsx',
    truncated: truncatePath('frontend/src/components/ArtifactCard.tsx', 30),
    segments: truncatePathSegments('frontend/src/components/ArtifactCard.tsx', 2),
    filename: getFileName('frontend/src/components/ArtifactCard.tsx'),
    dirPath: getDirPath('frontend/src/components/ArtifactCard.tsx'),
  },
  long: {
    original: '/very/long/path/to/deeply/nested/directory/structure/document/specification.md',
    truncated: truncatePath('/very/long/path/to/deeply/nested/directory/structure/document/specification.md', 50),
    segments: truncatePathSegments('/very/long/path/to/deeply/nested/directory/structure/document/specification.md', 3),
    filename: getFileName('/very/long/path/to/deeply/nested/directory/structure/document/specification.md'),
    dirPath: getDirPath('/very/long/path/to/deeply/nested/directory/structure/document/specification.md'),
  },
};

// Log examples (for console testing)
export function logExamples() {
  console.log('=== Date Formatting Examples ===');
  console.log('Relative:', dateExamples.formatted.relative);
  console.log('Full:', dateExamples.formatted.full);
  console.log('Custom:', dateExamples.formatted.custom);
  console.log('Short:', dateExamples.formatted.short);
  
  console.log('\n=== Category Color Examples ===');
  Object.entries(categoryExamples).forEach(([type, config]) => {
    console.log(`${type}:`, config.hexColor, '-', config.badgeClasses);
  });
  
  console.log('\n=== Path Truncation Examples ===');
  Object.entries(pathExamples).forEach(([size, example]) => {
    console.log(`${size} path:`);
    console.log('  Original:', example.original);
    console.log('  Truncated:', example.truncated);
    console.log('  Segments:', example.segments);
    console.log('  Filename:', example.filename);
    console.log('  DirPath:', example.dirPath);
  });
}
