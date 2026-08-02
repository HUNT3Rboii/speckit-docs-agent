/**
 * Enrichment Prompt Builder
 * 
 * Constructs the single AI prompt that requests all enrichments
 * (diagrams, glossary, summaries) with evidence citations.
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.3, 3.4
 */

/**
 * Builder for creating comprehensive AI enrichment prompts
 */
export class EnrichmentPromptBuilder {
  /**
   * Build the complete enrichment prompt including schema, evidence requirements,
   * self-check instructions, and examples.
   * 
   * @param markdown - The source markdown content to enrich
   * @param documentType - Optional document type classification (e.g., "spec", "design", "requirements")
   * @returns Complete prompt string for AI transformation
   */
  public buildPrompt(markdown: string, documentType: string = 'document'): string {
    const isTaskList = documentType === 'task_list';
    return `# Task: Transform Markdown Document to Enriched JSON

You are transforming a markdown document into a structured, enriched JSON format with evidence-based citations. Your output will be validated to ensure every claim you make is grounded in the actual source text.

## Source Document

\`\`\`markdown
${markdown}
\`\`\`

## Document Type

${documentType}

## Your Task

Generate a single JSON object containing:
1. **Document metadata** (title, abstract)
2. **Structured sections** (preserving ALL original headings)
3. **Diagrams** with evidence-cited components (where content warrants visualization)
4. **Glossary** with evidence-cited terms (technical terms from the document)
5. **Summaries** (executive summary and optional section summaries)
${isTaskList ? '6. **Task descriptions** (a user-friendly one-sentence description for every checklist task item - see Task Descriptions Guidance below)\n' : ''}
${this.getSchemaSection(isTaskList)}

${this.getEvidenceRequirementsSection()}

${this.getDiagramGuidanceSection()}

${this.getGlossaryGuidanceSection()}

${this.getSummaryGuidanceSection()}

${isTaskList ? this.getTaskDescriptionsGuidanceSection() : ''}

${this.getSelfCheckInstructionsSection(isTaskList)}

${this.getExamplesSection()}

## Output Format

Return ONLY the JSON object, with no markdown code fences, no explanations, no preamble. Start with { and end with }.

Begin your transformation now:`;
  }

  /**
   * Generate the complete JSON schema section
   */
  private getSchemaSection(includeTaskDescriptions: boolean = false): string {
    return `## Required JSON Schema

\`\`\`typescript
interface EnrichedJSON {
  title: string;                    // Document title
  abstract: string;                 // Brief document description (2-3 sentences)
  sections: Section[];              // Document sections (ALL original headings MUST be preserved)
  diagrams: Diagram[];              // AI-generated diagrams with evidence (0-10 diagrams)
  glossary: GlossaryEntry[];        // Term definitions with evidence (max 30 terms)
  summaries: Summaries;             // Executive and section summaries
${includeTaskDescriptions ? '  taskDescriptions: TaskDescription[]; // REQUIRED: one entry per checklist task item, see Task Descriptions Guidance\n' : ''}}

interface Section {
  heading: string;                  // Section heading text (MUST match original heading)
  content: string;                  // Section content (markdown)
  type: SectionType;                // Section classification
  level: number;                    // Heading level (1-6)
}

type SectionType = 
  | "normal"                        // Regular content
  | "callout"                       // Important note or warning
  | "open_question"                 // Unresolved question or discussion point
  | "task"                          // Task or action item
  | "user_story"                    // User story or requirement
  | "design_decision";              // Design decision or rationale

interface Diagram {
  type: DiagramType;                // Diagram type
  mermaidCode: string;              // Valid Mermaid syntax
  sectionRef: string;               // Section heading this diagram relates to
  location: DiagramLocation;        // Where to place the diagram
  components: DiagramComponent[];   // REQUIRED: All diagram components with evidence
  title?: string;                   // Optional diagram title
}

interface DiagramComponent {
  name: string;                     // Component label (e.g., "Auth Service", "User Database")
  evidence: string;                 // REQUIRED: Verbatim excerpt from source (20-100 words)
}

type DiagramType = 
  | "architecture"                  // System components and relationships
  | "sequence"                      // Process flow or interaction sequence
  | "state"                         // State transitions
  | "data_model"                    // Entity relationships
  | "flowchart";                    // Decision flow or algorithm

type DiagramLocation = 
  | \`after-section-\${number}\`      // After section N (e.g., "after-section-1")
  | \`inline-section-\${number}-paragraph-\${number}\`; // Within section (e.g., "inline-section-2-paragraph-1")

interface GlossaryEntry {
  term: string;                     // Technical term from document
  definition: string;               // 1-2 sentence definition
  evidence: string;                 // REQUIRED: Verbatim excerpt where term appears (10-50 words)
}

interface Summaries {
  executiveSummary: string;         // 2-4 sentence document overview
  perSection?: Record<string, string>; // Optional: 1-2 sentence summary per section heading (for sections > 200 words)
}
${includeTaskDescriptions ? `
interface TaskDescription {
  taskKey: string;                  // The task's ID exactly as it appears in the source (e.g. "T001")
  description: string;              // Short, user-friendly one-sentence description of what the task involves
}
` : ''}\`\`\``;
  }

  /**
   * Generate evidence requirements section
   */
  private getEvidenceRequirementsSection(): string {
    return `## Evidence Requirements (CRITICAL)

**Every diagram component and glossary entry MUST include a verbatim or near-verbatim excerpt from the source document.**

### What is Evidence?

Evidence is a SHORT, DIRECT QUOTE from the source markdown that supports your claim. It proves the component or term genuinely appears in the document.

### Evidence Rules:

1. **Verbatim Text**: Copy the text EXACTLY or nearly exactly from the source
2. **Length**: 
   - Diagram component evidence: 20-100 words
   - Glossary term evidence: 10-50 words
3. **Context**: Include enough surrounding text to show context
4. **No Paraphrasing**: Do NOT reword, summarize, or synthesize - use actual source text
5. **Fuzzy Tolerance**: Minor differences (punctuation, casing) are OK, but content must match

### Why Evidence Matters:

Your output will be validated using fuzzy string matching (≥85% similarity). If your evidence doesn't match actual source text, the validator will REJECT that component/term and ask you to fix it.

### Bad Evidence Examples (Will Be Rejected):

- ❌ "The system handles authentication" (paraphrased, not actual source text)
- ❌ "This component manages user data" (summary, not verbatim)
- ❌ "Described in section 2" (reference, not excerpt)
- ❌ "The Order Service publishes an OrderCreated event to the Event Bus" when
  the source actually says "The Order Service validates the request and
  publishes an OrderCreated event to the Event Bus" - silently dropping
  "validates the request and" from the MIDDLE of the sentence looks like a
  harmless shortening but breaks verbatim matching just as much as a full
  paraphrase does
- ❌ "From \`confirmed\`, the order moves to \`backordered\` if stock is
  unavailable" when the source actually says "From \`confirmed\`, the order
  moves to \`fulfilled\` once the Inventory Service reserves stock and ships
  the item, or to \`backordered\` if stock is unavailable" - when a sentence
  describes MULTIPLE alternative outcomes joined by "or"/"and", do not
  surgically cut out just the one branch you care about; that requires
  deleting words from the middle exactly like the example above. Quote the
  ENTIRE sentence (all branches) even if only one branch is relevant to the
  component you're citing evidence for

### Good Evidence Examples (Will Pass):

- ✓ "The authentication service validates user credentials against the database and issues JWT tokens upon successful login."
- ✓ "User data is stored in a PostgreSQL database with the following schema: users table containing id, email, hashed_password, and created_at columns."

### If You Need Shorter Evidence:

Only trim from the START or the END of a sentence/passage - never remove
words from the middle. "The Order Service validates the request and
publishes an OrderCreated event to the Event Bus" can be safely shortened to
"validates the request and publishes an OrderCreated event to the Event
Bus" (trimmed from the start) but NOT to "The Order Service publishes an
OrderCreated event to the Event Bus" (a clause carved out of the middle).`;
  }

  /**
   * Generate diagram guidance section
   */
  private getDiagramGuidanceSection(): string {
    return `## Diagram Generation Guidance

### When to Create Diagrams:

The following content types are diagrammable structure. If a section contains
ANY of these, you MUST generate the corresponding diagram for it - do not skip
one because a similar diagram already exists elsewhere in the document, and do
not treat this list as optional inspiration:
- **Architecture diagrams**: System components, services, modules with relationships
- **Sequence diagrams**: Process flows, API calls, interaction sequences
- **State diagrams**: State machines, status transitions, workflow states (e.g.
  a section listing states like "pending", "confirmed", "cancelled" and the
  transitions between them REQUIRES a stateDiagram-v2, even if a different
  diagram type already covers a different section)
- **Data models**: Entity relationships, database schemas
- **Flowcharts**: Decision logic, algorithms, branching processes

### When NOT to Create Diagrams:

- Simple lists or enumerations
- Purely textual descriptions without structural relationships
- Content already well-served by text

### Diagram Limits:

- Generate 0-10 diagrams per document
- Every section matching a category above gets its own diagram - "quality over
  quantity" means keep each diagram focused and don't pad in unrelated
  sections, NOT skipping sections that clearly qualify

### Component Evidence:

EVERY component in your Mermaid diagram MUST have a corresponding entry in the components[] array with evidence.

Example:
\`\`\`json
{
  "type": "architecture",
  "mermaidCode": "graph LR\\n  A[Frontend] --> B[API Gateway]\\n  B --> C[Auth Service]\\n  B --> D[User Service]",
  "sectionRef": "System Architecture",
  "location": "after-section-2",
  "components": [
    {
      "name": "Frontend",
      "evidence": "The web application frontend is built with React and communicates with the backend via REST APIs."
    },
    {
      "name": "API Gateway",
      "evidence": "All client requests pass through the API Gateway which handles routing, rate limiting, and authentication token validation."
    },
    {
      "name": "Auth Service",
      "evidence": "The authentication service manages user login, token generation, and session management using JWT tokens."
    },
    {
      "name": "User Service",
      "evidence": "User data and profile information is managed by the User Service which interfaces with the PostgreSQL database."
    }
  ],
  "title": "High-Level System Architecture"
}
\`\`\`

### Valid Mermaid Syntax:

Ensure your mermaidCode is syntactically valid. Common patterns:

**Architecture/Graph:**
\`\`\`
graph LR
  A[Component A] --> B[Component B]
  B --> C[Component C]
\`\`\`

**Sequence:**
\`\`\`
sequenceDiagram
  participant User
  participant API
  participant Database
  User->>API: Request
  API->>Database: Query
  Database-->>API: Result
  API-->>User: Response
\`\`\`

**State:**
\`\`\`
stateDiagram-v2
  [*] --> Draft
  Draft --> Review
  Review --> Approved
  Review --> Rejected
  Approved --> [*]
\`\`\``;
  }

  /**
   * Generate glossary guidance section
   */
  private getGlossaryGuidanceSection(): string {
    return `## Glossary Extraction Guidance

### What to Include:

Extract technical terms that readers may not know:
- **Capitalized terms**: Product names, proper nouns (e.g., "PostgreSQL", "JWT")
- **Acronyms**: Initialisms that need definition (e.g., "API", "REST", "CRUD")
- **Technical identifiers**: Terms in backticks or code formatting (e.g., \`user_id\`, \`authenticate()\`)
- **Domain-specific terms**: Industry or domain vocabulary (e.g., "idempotent", "eventual consistency")

### What to Exclude:

- Common programming terms (e.g., "function", "variable", "loop")
- General English words
- Terms obvious from context

### Limits:

- Maximum 30 terms
- If more than 30 candidates, prioritize by importance and complexity
- Rank by: specificity > complexity > frequency

### Term Evidence:

EVERY glossary entry MUST include evidence showing where the term appears in the source.

Example:
\`\`\`json
{
  "term": "JWT",
  "definition": "JSON Web Token - a compact, URL-safe means of representing claims to be transferred between two parties, used for authentication.",
  "evidence": "The authentication service issues JWT tokens upon successful login. These tokens contain user claims and are validated on each API request."
}
\`\`\`

Another example:
\`\`\`json
{
  "term": "Event Sourcing",
  "definition": "A pattern where state changes are stored as a sequence of events, allowing full audit history and the ability to reconstruct past states.",
  "evidence": "The system uses event sourcing to maintain a complete audit log. Every state change is recorded as an immutable event in the event store."
}
\`\`\``;
  }

  /**
   * Generate summary guidance section
   */
  private getSummaryGuidanceSection(): string {
    return `## Summary Generation Guidance

### Executive Summary:

- **Length**: 2-4 sentences
- **Content**: High-level purpose, scope, and key outcomes
- **Exclude**: Implementation details, technical specifics
- **Focus**: What, why, and for whom - not how

Example:
\`\`\`
"This document specifies the authentication and authorization system for the customer portal. It defines how users log in, how sessions are managed, and how access control is enforced across the application. The system uses JWT tokens for stateless authentication and role-based access control (RBAC) for authorization."
\`\`\`

### Section Summaries (Optional):

- Only for sections exceeding ~200 words
- **Length**: 1-2 sentences per section
- **Content**: Key points or takeaways from that section
- **Key by heading**: Use exact section heading as key

Example:
\`\`\`json
{
  "executiveSummary": "This document specifies...",
  "perSection": {
    "Authentication Flow": "Users authenticate with email and password. Upon success, the system issues a JWT token valid for 24 hours.",
    "Authorization Model": "The system implements role-based access control with three roles: Admin, Editor, and Viewer. Permissions are checked on every API request."
  }
}
\`\`\``;
  }

  /**
   * Generate task-descriptions guidance section (task-list documents only).
   * The backend's Kanban board parses each checklist line's raw trailing
   * text verbatim (e.g. "Implement POST /api/carts/{id}/items endpoint in
   * src/api/routes/cart.py") as the card's description - this section asks
   * the AI to also produce a plain-English rewrite per task, keyed by task
   * ID, which the backend prefers over the raw text when present.
   */
  private getTaskDescriptionsGuidanceSection(): string {
    return `## Task Descriptions Guidance (REQUIRED for task lists)

This document is a task list (tasks.md). Besides the standard output above, produce a top-level \`taskDescriptions\` array with ONE entry for EVERY checklist task line in the source - lines matching the pattern \`- [ ] T0xx ...\` or \`- [x] T0xx ...\` (optionally preceded by \`[P]\`/\`[StoryName]\` tags). Do not skip any task, and do not invent tasks that aren't in the source.

For each task:
- \`taskKey\`: the task's ID exactly as written (e.g. "T001", "T012") - do not renumber or reformat it.
- \`description\`: rewrite the raw checklist text into a short, clear, user-friendly ONE-SENTENCE description of what the task actually involves, in plain English. Do not just copy the raw text verbatim - explain it the way you'd describe it to someone skimming a project board, expanding file paths and jargon into plain language where it helps. Stay factual and grounded in what the task line actually says; don't invent scope the task doesn't have.

Example:
Raw checklist line: \`- [ ] T012 [P] [US2] Implement POST /api/carts/{id}/items endpoint in src/api/routes/cart.py\`
Good \`description\`: "Add the API endpoint that lets a user add an item to their shopping cart."
Bad \`description\` (just the raw text): "Implement POST /api/carts/{id}/items endpoint in src/api/routes/cart.py"

\`\`\`json
{
  "taskDescriptions": [
    { "taskKey": "T001", "description": "Set up the initial project folder structure and configuration." },
    { "taskKey": "T002", "description": "Configure the linter so code style is checked automatically." }
  ]
}
\`\`\``;
  }

  /**
   * Generate self-check instructions section
   */
  private getSelfCheckInstructionsSection(includeTaskDescriptions: boolean = false): string {
    return `## Self-Check Instructions (REQUIRED)

Before returning your JSON output, verify the following:

### 1. Heading Preservation Check

✓ Go through every heading in the original markdown (# through ######)
✓ Confirm that heading appears in your sections[] array
✓ Headings should match or be very similar (fuzzy match ≥85%)
✓ If any heading is missing, ADD IT to sections[] now

### 2. Evidence Validation Check

✓ For EVERY diagram component, verify the evidence is actual source text
✓ For EVERY glossary entry, verify the evidence is actual source text
✓ Open the source document mentally and find the exact or near-exact text
✓ Confirm your evidence is a SINGLE CONTIGUOUS SPAN of the source - read it
  side-by-side against the source sentence and check no words were skipped
  from the middle. If you shortened a sentence, the cut must be from the
  start or end only, never carved out of the middle (see "If You Need
  Shorter Evidence" above) - this is the single most common way evidence
  fails validation even when it "looks basically right"
✓ Specifically watch for "X, or Y" / "X, and Y" sentences describing
  multiple alternative or parallel outcomes: if you're citing evidence for
  only one outcome, you must still quote the FULL sentence (all outcomes),
  not just your outcome's clause - cutting out only "your" branch is the
  same as deleting words from the middle
✓ If you cannot find matching text, either:
  - Find the correct evidence quote, OR
  - Remove that component/term

### 3. Mermaid Syntax Check

✓ Verify each mermaidCode is syntactically valid
✓ Check for common errors: unmatched brackets, missing arrows, invalid keywords
✓ Ensure proper line breaks (use \\n in JSON string)

### 4. Schema Compliance Check

✓ Confirm all required fields are present
✓ Confirm field types match the schema (strings, arrays, objects)
✓ Confirm enum values (SectionType, DiagramType) are valid
✓ Confirm components[] and evidence fields are present for all diagrams/glossary
${includeTaskDescriptions ? `
### 5. Task Descriptions Completeness Check

✓ Go through every checklist task line in the source (\`- [ ] T0xx ...\` / \`- [x] T0xx ...\`)
✓ Confirm every single one has a matching entry in taskDescriptions[] by taskKey
✓ Confirm each description is a genuine plain-English rewrite, not the raw checklist text copied verbatim
✓ If any task is missing from taskDescriptions[], ADD IT now
` : ''}
### ${includeTaskDescriptions ? '6' : '5'}. Common Mistakes to Avoid

❌ Paraphrasing evidence instead of copying verbatim
❌ Dropping a clause from the MIDDLE of an otherwise-verbatim sentence to
   shorten it (trim from the start or end only, never the middle)
❌ Missing original headings from sections[]
❌ Creating diagram components without evidence
❌ Creating glossary entries without evidence
❌ Invalid Mermaid syntax
❌ Wrong SectionType or DiagramType enum values
${includeTaskDescriptions ? '❌ Copying the raw checklist text verbatim into a taskDescriptions[] description instead of rewriting it in plain English\n❌ Missing a taskDescriptions[] entry for a task that exists in the source' : ''}

If you find any of these issues, FIX THEM before returning your JSON.`;
  }

  /**
   * Generate examples section
   */
  private getExamplesSection(): string {
    return `## Complete Example

Here's a minimal but complete example showing proper structure:

\`\`\`json
{
  "title": "Authentication System Specification",
  "abstract": "This document defines the authentication and session management system for the customer portal. It covers login flows, token generation, and security requirements.",
  "sections": [
    {
      "heading": "Overview",
      "content": "The authentication system provides secure user login and session management...",
      "type": "normal",
      "level": 1
    },
    {
      "heading": "Login Flow",
      "content": "Users authenticate by submitting email and password...",
      "type": "normal",
      "level": 2
    },
    {
      "heading": "Security Requirements",
      "content": "All passwords must be hashed using bcrypt...",
      "type": "design_decision",
      "level": 2
    }
  ],
  "diagrams": [
    {
      "type": "sequence",
      "mermaidCode": "sequenceDiagram\\n  participant User\\n  participant Frontend\\n  participant AuthService\\n  participant Database\\n  User->>Frontend: Enter credentials\\n  Frontend->>AuthService: POST /login\\n  AuthService->>Database: Verify password\\n  Database-->>AuthService: Valid\\n  AuthService-->>Frontend: JWT token\\n  Frontend-->>User: Login success",
      "sectionRef": "Login Flow",
      "location": "after-section-2",
      "components": [
        {
          "name": "User",
          "evidence": "Users authenticate by submitting their email and password through the login form."
        },
        {
          "name": "Frontend",
          "evidence": "The frontend application collects credentials and sends them to the authentication service via a POST request to the /login endpoint."
        },
        {
          "name": "AuthService",
          "evidence": "The authentication service validates credentials against the database, hashes the provided password using bcrypt, and compares it with the stored hash."
        },
        {
          "name": "Database",
          "evidence": "User credentials are stored in the PostgreSQL database with bcrypt-hashed passwords. The database returns validation results to the auth service."
        }
      ],
      "title": "Login Sequence"
    }
  ],
  "glossary": [
    {
      "term": "JWT",
      "definition": "JSON Web Token - a compact, URL-safe token format used for authentication that contains encoded user claims and is cryptographically signed.",
      "evidence": "Upon successful authentication, the system issues a JWT token that contains the user's ID and role claims. This token is valid for 24 hours."
    },
    {
      "term": "bcrypt",
      "definition": "A password hashing algorithm designed to be computationally expensive to resist brute-force attacks.",
      "evidence": "All passwords must be hashed using bcrypt with a work factor of 12 before storage in the database."
    }
  ],
  "summaries": {
    "executiveSummary": "This specification defines a secure authentication system using JWT tokens for session management. Users log in with email and password, which are validated against bcrypt-hashed credentials stored in PostgreSQL.",
    "perSection": {
      "Login Flow": "Users submit credentials through the frontend, which are validated by the auth service against hashed passwords in the database, resulting in a JWT token on success.",
      "Security Requirements": "Passwords are hashed with bcrypt work factor 12, tokens expire after 24 hours, and all communication must use HTTPS."
    }
  }
}
\`\`\`

Notice:
- All headings from source are preserved in sections[]
- Every diagram component has evidence with actual source text quotes
- Every glossary entry has evidence showing where the term appears
- Evidence is verbatim or near-verbatim, not paraphrased
- Mermaid syntax is valid with proper escaping (\\n for newlines)
- All required fields are present`;
  }
}
