/**
 * Unit tests for date formatting functions
 * Tests date formatting with different timestamps (recent, days ago, specific dates)
 * **Validates: Requirements 4.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, formatDate, formatShortTime } from './dateFormat';

describe('dateFormat utilities', () => {
  beforeEach(() => {
    // Set a fixed date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatRelativeTime', () => {
    describe('recent timestamps (today)', () => {
      it('should format timestamp from 2 hours ago', () => {
        const twoHoursAgo = new Date('2024-03-15T10:00:00Z');
        const result = formatRelativeTime(twoHoursAgo);

        // date-fns may return "about 2 hours ago" or "2 hours ago"
        expect(result).toMatch(/about 2 hours ago|2 hours ago/);
      });

      it('should format timestamp from 30 minutes ago', () => {
        const thirtyMinutesAgo = new Date('2024-03-15T11:30:00Z');
        const result = formatRelativeTime(thirtyMinutesAgo);

        expect(result).toBe('30 minutes ago');
      });

      it('should format timestamp from 1 minute ago', () => {
        const oneMinuteAgo = new Date('2024-03-15T11:59:00Z');
        const result = formatRelativeTime(oneMinuteAgo);

        expect(result).toBe('1 minute ago');
      });

      it('should format timestamp from a few seconds ago', () => {
        const fewSecondsAgo = new Date('2024-03-15T11:59:50Z');
        const result = formatRelativeTime(fewSecondsAgo);

        expect(result).toBe('less than a minute ago');
      });

      it('should accept ISO date string input', () => {
        const result = formatRelativeTime('2024-03-15T10:00:00Z');

        expect(result).toMatch(/about 2 hours ago|2 hours ago/);
      });

      it('should accept Date object input', () => {
        const date = new Date('2024-03-15T10:00:00Z');
        const result = formatRelativeTime(date);

        expect(result).toMatch(/about 2 hours ago|2 hours ago/);
      });
    });

    describe('yesterday', () => {
      it('should return "yesterday" for dates from yesterday', () => {
        const yesterday = new Date('2024-03-14T15:00:00Z');
        const result = formatRelativeTime(yesterday);

        expect(result).toBe('yesterday');
      });

      it('should return "yesterday" for yesterday morning', () => {
        const yesterdayMorning = new Date('2024-03-14T08:00:00Z');
        const result = formatRelativeTime(yesterdayMorning);

        expect(result).toBe('yesterday');
      });

      it('should return "yesterday" for yesterday evening', () => {
        const yesterdayEvening = new Date('2024-03-14T23:00:00Z');
        const result = formatRelativeTime(yesterdayEvening);

        // Depending on timezone, this might return "yesterday" or "about X hours ago"
        // We'll check it's a reasonable format
        expect(result).toMatch(/yesterday|about \d+ hours ago|hours ago/);
      });
    });

    describe('older dates (days ago)', () => {
      it('should format date from 3 days ago', () => {
        const threeDaysAgo = new Date('2024-03-12T12:00:00Z');
        const result = formatRelativeTime(threeDaysAgo);

        expect(result).toBe('March 12, 2024');
      });

      it('should format date from last week', () => {
        const lastWeek = new Date('2024-03-08T12:00:00Z');
        const result = formatRelativeTime(lastWeek);

        expect(result).toBe('March 8, 2024');
      });

      it('should format date from last month', () => {
        const lastMonth = new Date('2024-02-15T12:00:00Z');
        const result = formatRelativeTime(lastMonth);

        expect(result).toBe('February 15, 2024');
      });

      it('should format date from last year', () => {
        const lastYear = new Date('2023-03-15T12:00:00Z');
        const result = formatRelativeTime(lastYear);

        expect(result).toBe('March 15, 2023');
      });
    });

    describe('specific dates', () => {
      it('should format January 1st, 2024', () => {
        const newYear = new Date('2024-01-01T00:00:00Z');
        const result = formatRelativeTime(newYear);

        expect(result).toBe('January 1, 2024');
      });

      it('should format December 31st, 2023', () => {
        const newYearsEve = new Date('2023-12-31T23:59:59Z');
        const result = formatRelativeTime(newYearsEve);

        // Due to timezone conversion, this might be January 1st in local time
        expect(result).toMatch(/December 31, 2023|January 1, 2024/);
      });

      it('should format April 20th, 2023', () => {
        const specificDate = new Date('2023-04-20T14:30:00Z');
        const result = formatRelativeTime(specificDate);

        expect(result).toBe('April 20, 2023');
      });
    });
  });

  describe('formatDate', () => {
    it('should format date with default format', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const result = formatDate(date);

      expect(result).toBe('March 15, 2024');
    });

    it('should format date with custom format string', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const result = formatDate(date, 'yyyy-MM-dd');

      expect(result).toBe('2024-03-15');
    });

    it('should format date with short format', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const result = formatDate(date, 'MMM d, yyyy');

      expect(result).toBe('Mar 15, 2024');
    });

    it('should format date with day of week', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const result = formatDate(date, 'EEEE, MMMM d, yyyy');

      expect(result).toBe('Friday, March 15, 2024');
    });

    it('should format time with hours and minutes', () => {
      const date = new Date('2024-03-15T14:30:00Z');
      const result = formatDate(date, 'h:mm a');

      // Time formatting depends on system timezone, so we just check format
      expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    });

    it('should accept ISO date string input', () => {
      const result = formatDate('2024-03-15T12:00:00Z', 'MMMM d, yyyy');

      expect(result).toBe('March 15, 2024');
    });

    it('should accept Date object input', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const result = formatDate(date, 'MMMM d, yyyy');

      expect(result).toBe('March 15, 2024');
    });

    it('should handle different months correctly', () => {
      const dates = [
        { date: '2024-01-15T12:00:00Z', expected: 'January 15, 2024' },
        { date: '2024-06-15T12:00:00Z', expected: 'June 15, 2024' },
        { date: '2024-12-15T12:00:00Z', expected: 'December 15, 2024' },
      ];

      dates.forEach(({ date, expected }) => {
        expect(formatDate(date)).toBe(expected);
      });
    });
  });

  describe('formatShortTime', () => {
    describe('recent timestamps (today)', () => {
      it('should format timestamp from 2 hours ago', () => {
        const twoHoursAgo = new Date('2024-03-15T10:00:00Z');
        const result = formatShortTime(twoHoursAgo);

        // date-fns may return "about 2 hours ago" or "2 hours ago"
        expect(result).toMatch(/about 2 hours ago|2 hours ago/);
      });

      it('should format timestamp from 45 minutes ago', () => {
        const minutesAgo = new Date('2024-03-15T11:15:00Z');
        const result = formatShortTime(minutesAgo);

        // date-fns may round to "about 1 hour ago" or show "45 minutes ago"
        expect(result).toMatch(/about 1 hour ago|45 minutes ago/);
      });

      it('should format very recent timestamp', () => {
        const justNow = new Date('2024-03-15T11:59:30Z');
        const result = formatShortTime(justNow);

        // date-fns may return "less than a minute ago" or "1 minute ago"
        expect(result).toMatch(/less than a minute ago|1 minute ago/);
      });
    });

    describe('yesterday', () => {
      it('should return "yesterday" for yesterday', () => {
        const yesterday = new Date('2024-03-14T12:00:00Z');
        const result = formatShortTime(yesterday);

        expect(result).toBe('yesterday');
      });
    });

    describe('older dates (abbreviated format)', () => {
      it('should format date from 3 days ago with short month', () => {
        const threeDaysAgo = new Date('2024-03-12T12:00:00Z');
        const result = formatShortTime(threeDaysAgo);

        expect(result).toBe('Mar 12');
      });

      it('should format date from last week with short format', () => {
        const lastWeek = new Date('2024-03-08T12:00:00Z');
        const result = formatShortTime(lastWeek);

        expect(result).toBe('Mar 8');
      });

      it('should format date from different month', () => {
        const lastMonth = new Date('2024-02-15T12:00:00Z');
        const result = formatShortTime(lastMonth);

        expect(result).toBe('Feb 15');
      });

      it('should format date from January', () => {
        const january = new Date('2024-01-10T12:00:00Z');
        const result = formatShortTime(january);

        expect(result).toBe('Jan 10');
      });

      it('should format date from December', () => {
        const december = new Date('2023-12-25T12:00:00Z');
        const result = formatShortTime(december);

        expect(result).toBe('Dec 25');
      });
    });

    describe('input types', () => {
      it('should accept ISO date string input', () => {
        const result = formatShortTime('2024-03-12T12:00:00Z');

        expect(result).toBe('Mar 12');
      });

      it('should accept Date object input', () => {
        const date = new Date('2024-03-12T12:00:00Z');
        const result = formatShortTime(date);

        expect(result).toBe('Mar 12');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle dates far in the past', () => {
      const oldDate = new Date('2000-01-01T00:00:00Z');
      const result = formatRelativeTime(oldDate);

      expect(result).toBe('January 1, 2000');
    });

    it('should handle leap year dates', () => {
      const leapDay = new Date('2024-02-29T12:00:00Z');
      const result = formatDate(leapDay);

      expect(result).toBe('February 29, 2024');
    });

    it('should handle dates at midnight', () => {
      const midnight = new Date('2024-03-10T00:00:00Z');
      const result = formatDate(midnight);

      expect(result).toBe('March 10, 2024');
    });

    it('should handle dates at end of day', () => {
      const endOfDay = new Date('2024-03-10T23:59:59Z');
      const result = formatDate(endOfDay);

      // Due to timezone conversion, this could be March 10 or March 11
      expect(result).toMatch(/March 10, 2024|March 11, 2024/);
    });
  });

  describe('consistency across functions', () => {
    it('should format the same date consistently when older than yesterday', () => {
      const oldDate = new Date('2024-03-10T12:00:00Z');

      const relativeFull = formatRelativeTime(oldDate);
      const dateFull = formatDate(oldDate);

      // Both should produce the same full date format
      expect(relativeFull).toBe(dateFull);
      expect(relativeFull).toBe('March 10, 2024');
    });

    it('should handle ISO strings the same as Date objects', () => {
      const isoString = '2024-03-10T12:00:00Z';
      const dateObject = new Date(isoString);

      expect(formatRelativeTime(isoString)).toBe(formatRelativeTime(dateObject));
      expect(formatDate(isoString)).toBe(formatDate(dateObject));
      expect(formatShortTime(isoString)).toBe(formatShortTime(dateObject));
    });
  });
});
