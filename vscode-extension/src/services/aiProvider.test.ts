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

  public buildTransformPromptFor(markdown: string, sourcePath?: string): string {
    return this.buildTransformPrompt(markdown, undefined, sourcePath);
  }

  public inferDocumentTypeFor(sourcePath: string): string {
    return this.inferDocumentType(sourcePath);
  }

  public computeTimeoutFor(markdown: string): number {
    return this.computeTimeout(markdown);
  }

  public getTimeout(): number {
    return this.timeout;
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

  it('includes a reminder for schema_errors naming the flagged issues', () => {
    const structuredError: StructuredError = {
      valid: false,
      retry_count: 0,
      errors: { schema_errors: ['Section 7: Missing or invalid content', 'Section 10: Missing or invalid content'] },
      warnings: []
    };

    const prompt = provider.buildCorrectionPrompt('# Test', structuredError);

    expect(prompt).toContain('schema_errors');
    expect(prompt).toContain('Section 7: Missing or invalid content');
    expect(prompt).toContain('Section 10: Missing or invalid content');
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

describe('BaseAIProvider.inferDocumentType', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('classifies a flat tasks.md as task_list', () => {
    expect(provider.inferDocumentTypeFor('specs/001-feature/tasks.md')).toBe('task_list');
  });

  it('classifies a file under a tasks/ directory as task_list', () => {
    expect(provider.inferDocumentTypeFor('docs/tasks/backlog.md')).toBe('task_list');
  });

  it('is case-insensitive and handles backslash path separators', () => {
    expect(provider.inferDocumentTypeFor('specs\\001-feature\\TASKS.MD')).toBe('task_list');
  });

  it('classifies anything else as document', () => {
    expect(provider.inferDocumentTypeFor('specs/001-feature/spec.md')).toBe('document');
  });
});

describe('BaseAIProvider.buildTransformPrompt', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('requests taskDescriptions when sourcePath is a tasks.md', () => {
    const prompt = provider.buildTransformPromptFor('# Tasks', 'specs/001-feature/tasks.md');
    expect(prompt).toContain('taskDescriptions');
  });

  it('does not request taskDescriptions for a non-task sourcePath', () => {
    const prompt = provider.buildTransformPromptFor('# Spec', 'specs/001-feature/spec.md');
    expect(prompt).not.toContain('taskDescriptions');
  });

  it('defaults to the generic document prompt when sourcePath is omitted', () => {
    const prompt = provider.buildTransformPromptFor('# Spec');
    expect(prompt).not.toContain('taskDescriptions');
  });
});

describe('BaseAIProvider.computeTimeout', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('floors small documents at 45 seconds', () => {
    expect(provider.computeTimeoutFor('short doc')).toBe(45000);
  });

  it('scales up for larger documents', () => {
    const markdown = 'x'.repeat(20000);
    expect(provider.computeTimeoutFor(markdown)).toBe(60000);
  });

  it('caps very large documents at 3 minutes', () => {
    const markdown = 'x'.repeat(100000);
    expect(provider.computeTimeoutFor(markdown)).toBe(180000);
  });

  it('does not mutate the timeout until setTimeout is actually called', () => {
    expect(provider.getTimeout()).toBe(15000);
  });
});
