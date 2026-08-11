/**
 * Truncates a file path with ellipsis while preserving the most important parts
 * 
 * Strategy:
 * - For short paths (< maxLength), return as-is
 * - For long paths, show beginning and end with "..." in the middle
 * - Preserves file name at the end for readability
 * 
 * @param path The file path to truncate
 * @param maxLength Maximum length before truncation (default: 50)
 * @returns Truncated path with ellipsis if needed
 */
export function truncatePath(path: string, maxLength: number = 50): string {
  if (!path || path.length <= maxLength) {
    return path;
  }

  // Find the last slash to preserve the filename
  const lastSlashIndex = path.lastIndexOf('/');
  
  // If no slash found, just truncate with ellipsis at the end
  if (lastSlashIndex === -1) {
    return path.slice(0, maxLength - 3) + '...';
  }

  const filename = path.slice(lastSlashIndex + 1);
  
  // If filename itself is too long, truncate it
  if (filename.length >= maxLength - 10) {
    return '...' + filename.slice(-(maxLength - 6));
  }

  // Calculate how much of the directory path we can show
  const availableSpace = maxLength - filename.length - 4; // 4 for ".../"
  
  if (availableSpace <= 0) {
    return '.../' + filename;
  }

  // Show the beginning of the path
  const beginningPath = path.slice(0, availableSpace);
  
  return beginningPath + '.../' + filename;
}

/**
 * Truncates a path by keeping only the last N segments
 * 
 * @param path The file path to truncate
 * @param segments Number of path segments to keep (default: 3)
 * @returns Truncated path with ellipsis prefix
 */
export function truncatePathSegments(path: string, segments: number = 3): string {
  if (!path) {
    return path;
  }

  const parts = path.split('/');
  
  if (parts.length <= segments) {
    return path;
  }

  return '.../' + parts.slice(-segments).join('/');
}

/**
 * Gets the filename from a path
 * 
 * @param path The file path
 * @returns The filename (last segment of the path)
 */
export function getFileName(path: string): string {
  if (!path) {
    return '';
  }

  const lastSlashIndex = path.lastIndexOf('/');
  
  if (lastSlashIndex === -1) {
    return path;
  }

  return path.slice(lastSlashIndex + 1);
}

/**
 * Gets the directory path (everything before the last segment)
 * 
 * @param path The file path
 * @returns The directory path without the filename
 */
export function getDirPath(path: string): string {
  if (!path) {
    return '';
  }

  const lastSlashIndex = path.lastIndexOf('/');
  
  if (lastSlashIndex === -1) {
    return '';
  }

  return path.slice(0, lastSlashIndex);
}
