import { BaseAIProvider } from './aiProvider';
import { StructuredError, StructuredJSON } from '../types';

/**
 * Minimal concrete subclass exposing the protected prompt-building methods
 * for testing. BaseAIProvider has no vscode import - its prompt logic is
 * pure string manipulation, just gated behind `protected` visibility.
 */
class TestProvider extends BaseAIProvider {
  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public getProviderName(): string {
    return 'Test';
  }

  public async transform(): Promise<StructuredJSON> {
    throw new Error('not used in these tests');
  }

  public buildCorrectionPrompt(markdown: string, structuredError: StructuredError): string {
    return this.createCorrectionPrompt(markdown, structuredError);
  }
}

describe('BaseAIProvider.createCorrectionPrompt', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('includes a reminder for missing_diagrams naming the flagged sections', () => {
    const structuredError: StructuredError = {
      valid: false,
      retry_count: 0,
      errors: { missing_diagrams: ['Request Flow', 'Order Status Lifecycle'] },
      warnings: []
    };

    const prompt = provider.buildCorrectionPrompt('# Test', structuredError);

    expect(prompt).toContain('missing_diagrams');
    expect(prompt).toContain('Request Flow');
    expect(prompt).toContain('Order Status Lifecycle');
    expect(prompt.toLowerCase()).toContain('add a diagram for each named section');
  });

  it('does not remove other correction reminders when missing_diagrams is present', () => {
    const structuredError: StructuredError = {
      valid: false,
      retry_count: 1,
      errors: {
        missing_headings: ['Overview'],
        ungrounded_diagrams: ['Diagram [diagram_0], Component X'],
        missing_diagrams: ['Request Flow']
      },
      warnings: []
    };

    const prompt = provider.buildCorrectionPrompt('# Test', structuredError);

    expect(prompt).toContain('missing_headings');
    expect(prompt).toContain('ungrounded_diagrams');
    expect(prompt).toContain('missing_diagrams');
  });

  it('includes the retry count in the correction prompt', () => {
    const structuredError: StructuredError = {
      valid: false,
      retry_count: 2,
      errors: { missing_diagrams: ['Architecture'] },
      warnings: []
    };

    const prompt = provider.buildCorrectionPrompt('# Test', structuredError);

    expect(prompt).toContain('Retry 2');
  });
});
