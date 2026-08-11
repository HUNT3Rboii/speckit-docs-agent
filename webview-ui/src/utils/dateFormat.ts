import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';

/**
 * Formats a date string or Date object into a human-readable relative time
 * (e.g., "2 hours ago", "yesterday", "March 15, 2024")
 * 
 * @param dateInput ISO date string or Date object
 * @returns Human-readable formatted date string
 */
export function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;

  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (isYesterday(date)) {
    return 'yesterday';
  }

  // For dates older than yesterday, show the full date
  return format(date, 'MMMM d, yyyy');
}

/**
 * Formats a date string or Date object into a specific format
 * 
 * @param dateInput ISO date string or Date object
 * @param formatString The format pattern (default: 'MMMM d, yyyy')
 * @returns Formatted date string
 */
export function formatDate(dateInput: string | Date, formatString: string = 'MMMM d, yyyy'): string {
  const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
  return format(date, formatString);
}

/**
 * Formats a timestamp into a short, readable format
 * (e.g., "2h ago", "Mar 15")
 * 
 * @param dateInput ISO date string or Date object
 * @returns Short formatted date string
 */
export function formatShortTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;

  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (isYesterday(date)) {
    return 'yesterday';
  }

  // For older dates, show abbreviated month and day
  return format(date, 'MMM d');
}
