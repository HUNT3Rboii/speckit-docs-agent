"""
Enriched JSON Data Models

Defines the schema for the single JSON output from AI transformation.
All diagram components and glossary entries MUST include evidence fields.
"""

from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field


# Section Types
SectionType = Literal[
    "normal",
    "callout",
    "open_question",
    "task",
    "user_story",
    "design_decision"
]

# Diagram Types
DiagramType = Literal[
    "architecture",
    "sequence",
    "state",
    "data_model",
    "flowchart"
]


class Section(BaseModel):
    """Document section with content and metadata."""
    
    heading: str = Field(..., description="Section heading text")
    content: str = Field(..., description="Section content (markdown)")
    type: SectionType = Field(..., description="Section classification")
    level: int = Field(..., ge=1, le=6, description="Heading level (1-6)")


class DiagramComponent(BaseModel):
    """Diagram component with evidence citation."""
    
    name: str = Field(..., description="Component label (e.g., 'Auth Service')")
    evidence: str = Field(
        ..., 
        description="REQUIRED: Verbatim excerpt from source that supports this component"
    )


class Diagram(BaseModel):
    """AI-generated diagram with evidence-based components."""
    
    type: DiagramType = Field(..., description="Diagram type")
    mermaidCode: str = Field(..., description="Mermaid syntax")
    sectionRef: str = Field(..., description="Section reference")
    location: str = Field(
        ..., 
        description="Placement location (e.g., 'after-section-1' or 'inline-section-2-paragraph-1')"
    )
    components: List[DiagramComponent] = Field(
        ..., 
        description="REQUIRED: Components with evidence citations"
    )
    title: Optional[str] = Field(None, description="Optional diagram title")


class GlossaryEntry(BaseModel):
    """Glossary term with definition and evidence."""
    
    term: str = Field(..., description="Technical term")
    definition: str = Field(..., description="1-2 sentence definition")
    evidence: str = Field(
        ..., 
        description="REQUIRED: Verbatim excerpt from source where term appears or is implied"
    )


class Summaries(BaseModel):
    """Document summaries."""
    
    executiveSummary: str = Field(..., description="2-4 sentence overview")
    perSection: Optional[dict[str, str]] = Field(
        None, 
        description="Optional per-section summaries keyed by section heading"
    )


class EnrichedJSON(BaseModel):
    """
    Single JSON output from AI transformation call.
    
    Contains all enrichments with evidence citations for diagrams and glossary.
    """
    
    title: str = Field(..., description="Document title")
    abstract: str = Field(..., description="Brief document description")
    sections: List[Section] = Field(..., description="Document sections")
    diagrams: List[Diagram] = Field(..., description="AI-generated diagrams with evidence")
    glossary: List[GlossaryEntry] = Field(..., description="Term definitions with evidence")
    summaries: Summaries = Field(..., description="Executive and section summaries")


class ValidationResult(BaseModel):
    """Result of validation checks."""
    
    valid: bool = Field(..., description="Whether validation passed")
    errors: List[str] = Field(default_factory=list, description="Validation error messages")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings")
    filtered_data: Optional[dict] = Field(
        None, 
        description="Data after filtering invalid entries"
    )


class RenderResult(BaseModel):
    """Result of diagram rendering."""
    
    success: bool = Field(..., description="Whether rendering succeeded")
    image_path: Optional[str] = Field(None, description="Path to rendered image")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    rendering_method: str = Field(
        ..., 
        description="Rendering method used: 'mmdc', 'kroki', or 'failed'"
    )
    cache_hit: bool = Field(..., description="Whether result was from cache")
