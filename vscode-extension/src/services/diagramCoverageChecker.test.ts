import { DiagramCoverageChecker } from './diagramCoverageChecker';
import { Section, Diagram } from '../types';

describe('DiagramCoverageChecker', () => {
  let checker: DiagramCoverageChecker;

  beforeEach(() => {
    checker = new DiagramCoverageChecker();
  });

  function section(heading: string): Section {
    return { heading, content: 'Some content.', type: 'normal', level: 2 };
  }

  function diagram(sectionRef: string): Diagram {
    return {
      type: 'architecture',
      mermaidCode: 'graph LR\n  A-->B',
      sectionRef,
      location: 'after-section-1',
      components: []
    };
  }

  it('flags a "Request Flow" heading with no covering diagram', () => {
    const gaps = checker.findGaps([section('Request Flow')], []);

    expect(gaps).toEqual([{ heading: 'Request Flow', category: 'sequence' }]);
  });

  it('flags an "Order Status Lifecycle" heading with no covering diagram', () => {
    const gaps = checker.findGaps([section('Order Status Lifecycle')], []);

    expect(gaps).toEqual([{ heading: 'Order Status Lifecycle', category: 'state' }]);
  });

  it('flags an "Architecture" heading with no covering diagram', () => {
    const gaps = checker.findGaps([section('Architecture')], []);

    expect(gaps).toEqual([{ heading: 'Architecture', category: 'architecture' }]);
  });

  it('flags a "Data Model" heading with no covering diagram', () => {
    const gaps = checker.findGaps([section('Data Model')], []);

    expect(gaps).toEqual([{ heading: 'Data Model', category: 'data-model' }]);
  });

  it('does not flag a section already covered by a diagram', () => {
    const gaps = checker.findGaps(
      [section('Architecture')],
      [diagram('Architecture')]
    );

    expect(gaps).toEqual([]);
  });

  it('matches sectionRef case-insensitively and ignoring surrounding whitespace', () => {
    const gaps = checker.findGaps(
      [section('Architecture')],
      [diagram('  architecture  ')]
    );

    expect(gaps).toEqual([]);
  });

  it('matches an emoji-decorated heading against a plain sectionRef', () => {
    // Real case from this project's own README: the heading is "🏗️ Architecture"
    // but the AI reports sectionRef "Architecture", so raw comparison reported
    // the section as uncovered and asked for a second diagram.
    const gaps = checker.findGaps(
      [section('\u{1F3D7}️ Architecture')],
      [diagram('Architecture')]
    );

    expect(gaps).toEqual([]);
  });

  it('matches when the emoji is on the sectionRef instead of the heading', () => {
    const gaps = checker.findGaps(
      [section('Data Flow')],
      [diagram('\u{1F504} Data Flow')]
    );

    expect(gaps).toEqual([]);
  });

  it('strips composed emoji sequences (ZWJ and skin tone) from both sides', () => {
    const gaps = checker.findGaps(
      [section('\u{1F469}\u{1F3FD}‍\u{1F4BB} System Design')],
      [diagram('system design')]
    );

    expect(gaps).toEqual([]);
  });

  it('still flags an emoji-decorated heading that genuinely has no diagram', () => {
    const gaps = checker.findGaps([section('\u{1F504} Data Flow')], []);

    expect(gaps).toEqual([
      { heading: '\u{1F504} Data Flow', category: 'sequence' }
    ]);
  });

  it('keeps digits and punctuation that emoji stripping must not touch', () => {
    // "2" and "#" carry Emoji_Component in Unicode; removing them would make
    // "Step 2: Architecture" and "Step 3: Architecture" compare equal.
    const gaps = checker.findGaps(
      [section('Step 2: Architecture')],
      [diagram('Step 3: Architecture')]
    );

    expect(gaps).toEqual([
      { heading: 'Step 2: Architecture', category: 'architecture' }
    ]);
  });

  it('does not flag a section with no diagrammable heading keyword', () => {
    const gaps = checker.findGaps([section('Overview')], []);

    expect(gaps).toEqual([]);
  });

  it('does not flag "User Stories" or "Tasks" (not diagrammable content)', () => {
    const gaps = checker.findGaps(
      [section('User Stories'), section('Tasks')],
      []
    );

    expect(gaps).toEqual([]);
  });

  it('handles multiple gaps across a realistic document', () => {
    const sections = [
      section('Overview'),
      section('Architecture'),
      section('Request Flow'),
      section('Order Status Lifecycle'),
      section('Data Model'),
      section('Glossary Notes')
    ];
    const diagrams = [diagram('Architecture')];

    const gaps = checker.findGaps(sections, diagrams);

    expect(gaps.map(g => g.heading)).toEqual(['Request Flow', 'Order Status Lifecycle', 'Data Model']);
  });

  it('returns an empty array when there are no sections', () => {
    expect(checker.findGaps([], [])).toEqual([]);
  });
});
