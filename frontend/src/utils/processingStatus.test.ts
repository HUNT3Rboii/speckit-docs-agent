import { describe, it, expect } from 'vitest';
import { isActivelyProcessing, isProcessing, needsCorrection, stepLabel } from './processingStatus';

describe('processingStatus utilities', () => {
  describe('isActivelyProcessing', () => {
    it('is true only for "processing"', () => {
      expect(isActivelyProcessing('processing')).toBe(true);
      expect(isActivelyProcessing('retry_needed')).toBe(false);
      expect(isActivelyProcessing('rendered')).toBe(false);
      expect(isActivelyProcessing('failed')).toBe(false);
    });
  });

  describe('isProcessing', () => {
    it('is true for "processing"', () => {
      expect(isProcessing('processing')).toBe(true);
    });

    it('is true for "retry_needed"', () => {
      expect(isProcessing('retry_needed')).toBe(true);
    });

    it('is false for "rendered"', () => {
      expect(isProcessing('rendered')).toBe(false);
    });

    it('is false for "failed"', () => {
      expect(isProcessing('failed')).toBe(false);
    });
  });

  describe('needsCorrection', () => {
    it('is true only for "retry_needed"', () => {
      expect(needsCorrection('retry_needed')).toBe(true);
      expect(needsCorrection('processing')).toBe(false);
      expect(needsCorrection('rendered')).toBe(false);
      expect(needsCorrection('failed')).toBe(false);
    });
  });

  describe('stepLabel', () => {
    it('maps known step keys to friendly labels', () => {
      expect(stepLabel({ status: 'processing', metadata: { current_step: 'validating' } })).toBe(
        'Validating content'
      );
      expect(
        stepLabel({ status: 'processing', metadata: { current_step: 'rendering_diagrams' } })
      ).toBe('Rendering diagrams');
      expect(stepLabel({ status: 'processing', metadata: { current_step: 'generating_pdf' } })).toBe(
        'Generating PDF'
      );
    });

    it('maps client-reported (pre-/api/process) step keys to friendly labels', () => {
      expect(
        stepLabel({ status: 'processing', metadata: { current_step: 'transforming_with_ai' } })
      ).toBe('Transforming with AI');
      expect(stepLabel({ status: 'processing', metadata: { current_step: 'correcting' } })).toBe(
        'Correcting and resubmitting'
      );
      expect(stepLabel({ status: 'processing', metadata: { current_step: 'submitting' } })).toBe(
        'Submitting to backend'
      );
    });

    it('falls back to "Processing" for an unrecognized or missing step', () => {
      expect(stepLabel({ status: 'processing', metadata: {} })).toBe('Processing');
      expect(stepLabel({ status: 'processing', metadata: { current_step: 'some_new_step' } })).toBe(
        'Processing'
      );
      expect(stepLabel({ status: 'processing' })).toBe('Processing');
    });

    it('shows the error message for a failed artifact', () => {
      expect(stepLabel({ status: 'failed', metadata: { error: 'boom' } })).toBe('Failed: boom');
    });

    it('falls back to plain "Failed" when no error message is present', () => {
      expect(stepLabel({ status: 'failed', metadata: {} })).toBe('Failed');
    });

    it('surfaces the first structured validation error for retry_needed', () => {
      expect(
        stepLabel({
          status: 'retry_needed',
          metadata: {
            structured_error: {
              valid: false,
              retry_count: 1,
              errors: { ungrounded_diagrams: ['Diagram evidence ungrounded for component X'] },
              warnings: [],
            },
          },
        })
      ).toBe('Needs correction: Diagram evidence ungrounded for component X');
    });

    it('falls back to a generic message for retry_needed when no structured error is stored', () => {
      expect(stepLabel({ status: 'retry_needed', metadata: {} })).toBe(
        'Needs correction before this can render'
      );
    });

    it('appends the attempt count when a client-side correction loop is in progress', () => {
      expect(
        stepLabel({
          status: 'processing',
          metadata: { current_step: 'correcting', attempt: 2, max_attempts: 5 },
        })
      ).toBe('Correcting and resubmitting (attempt 2/5)');
    });

    it('omits the attempt count when only one of attempt/max_attempts is present', () => {
      expect(
        stepLabel({ status: 'processing', metadata: { current_step: 'transforming_with_ai', attempt: 1 } })
      ).toBe('Transforming with AI');
      expect(
        stepLabel({
          status: 'processing',
          metadata: { current_step: 'transforming_with_ai', max_attempts: 5 },
        })
      ).toBe('Transforming with AI');
    });

    it('does not append an attempt count for retry_needed (that is a parked state, not a live loop)', () => {
      expect(
        stepLabel({
          status: 'retry_needed',
          metadata: { current_step: 'awaiting_retry', attempt: 2, max_attempts: 5 },
        })
      ).toBe('Needs correction before this can render');
    });
  });
});
