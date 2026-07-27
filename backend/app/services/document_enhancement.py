from __future__ import annotations

from typing import Any, Dict, List, Optional
from app.services.diagram_generation import DiagramGenerationService, DiagramType


class DocumentEnhancementService:
    """
    AI-powered document enhancement service.
    
    Takes raw markdown and creates professional documentation with:
    - Intelligent section splitting
    - Auto-generated diagrams
    - Table of contents
    - Cross-references
    - Glossary
    - Summary sections
    - Best practices and recommendations
    """

    def __init__(self):
        self.diagram_service = DiagramGenerationService()

    def enhance_document(self, structured_doc: Dict[str, Any], artifact_type: str) -> Dict[str, Any]:
        """
        Enhance a structured document with AI-powered improvements.
        
        Returns enhanced document with additional sections, diagrams, and metadata.
        """
        title = structured_doc.get("title", "Untitled Document")
        abstract = structured_doc.get("abstract", "")
        sections = structured_doc.get("sections", [])
        
        # Step 1: Analyze and generate diagrams
        diagrams = self.diagram_service.analyze_content_for_diagrams(sections, artifact_type)
        
        # Step 2: Split large sections intelligently
        enhanced_sections = self._split_sections_intelligently(sections)
        
        # Step 3: Add cross-references
        enhanced_sections = self._add_cross_references(enhanced_sections)
        
        # Step 4: Generate table of contents
        toc = self._generate_toc(enhanced_sections)
        
        # Step 5: Extract and create glossary
        glossary = self._extract_glossary(enhanced_sections)
        
        # Step 6: Generate executive summary if needed
        executive_summary = self._generate_executive_summary(title, abstract, sections, artifact_type)
        
        # Step 7: Add best practices section if applicable
        best_practices = self._generate_best_practices(sections, artifact_type)
        
        # Build enhanced document structure
        enhanced = {
            "title": title,
            "abstract": abstract,
            "artifact_type": artifact_type,
            "source_path": structured_doc.get("source_path", ""),
            "enhanced": True,
            "enhancements": {
                "diagrams_generated": len(diagrams),
                "sections_split": len(enhanced_sections) - len(sections),
                "glossary_terms": len(glossary),
                "has_toc": True,
                "has_executive_summary": bool(executive_summary)
            },
            # Main content
            "executive_summary": executive_summary,
            "table_of_contents": toc,
            "sections": enhanced_sections,
            "diagrams": diagrams,
            "glossary": glossary,
            "best_practices": best_practices,
            # Metadata for PDF generation
            "metadata": {
                "page_break_after_toc": True,
                "include_page_numbers": True,
                "include_header_footer": True,
                "diagram_style": "mermaid",
                "color_scheme": "professional"
            }
        }
        
        return enhanced

    def _split_sections_intelligently(self, sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Split large sections into smaller, more manageable subsections.
        
        Rules:
        - Sections > 500 words should be split
        - Look for natural breakpoints (subheadings, paragraphs)
        - Maintain logical flow
        """
        enhanced_sections = []
        
        for section in sections:
            content = section.get("content", "")
            heading = section.get("heading", "")
            section_type = section.get("type", "normal")
            
            word_count = len(content.split())
            
            # If section is small enough, keep as is
            if word_count < 500:
                enhanced_sections.append(section)
                continue
            
            # Try to split by subheadings (###, ####)
            subsections = self._split_by_subheadings(content)
            
            if len(subsections) > 1:
                for i, (subheading, subcontent) in enumerate(subsections):
                    enhanced_sections.append({
                        "heading": f"{heading} - {subheading}" if subheading else heading,
                        "content": subcontent,
                        "type": section_type,
                        "parent_section": heading,
                        "subsection_index": i
                    })
            else:
                # Can't split, keep as is
                enhanced_sections.append(section)
        
        return enhanced_sections

    def _split_by_subheadings(self, content: str) -> List[tuple[str, str]]:
        """Split content by markdown subheadings."""
        import re
        
        # Pattern for ### or #### headings
        pattern = r'^(#{3,4})\s+(.+)$'
        
        subsections = []
        current_heading = ""
        current_content = []
        
        for line in content.split('\n'):
            match = re.match(pattern, line)
            if match:
                # Save previous subsection
                if current_content:
                    subsections.append((current_heading, '\n'.join(current_content)))
                current_heading = match.group(2)
                current_content = []
            else:
                current_content.append(line)
        
        # Save last subsection
        if current_content:
            subsections.append((current_heading, '\n'.join(current_content)))
        
        return subsections if len(subsections) > 1 else [(current_heading, content)]

    def _add_cross_references(self, sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Add cross-references between related sections."""
        # Build section index
        section_index = {s.get("heading", ""): i for i, s in enumerate(sections)}
        
        for section in sections:
            content = section.get("content", "")
            references = []
            
            # Find mentions of other section headings
            for heading, idx in section_index.items():
                if heading and heading != section.get("heading") and heading.lower() in content.lower():
                    references.append({
                        "section": heading,
                        "index": idx
                    })
            
            if references:
                section["cross_references"] = references
        
        return sections

    def _generate_toc(self, sections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate table of contents from sections."""
        toc_entries = []
        
        for i, section in enumerate(sections):
            heading = section.get("heading", f"Section {i+1}")
            section_type = section.get("type", "normal")
            
            toc_entries.append({
                "heading": heading,
                "page": i + 1,  # Will be updated during PDF generation
                "type": section_type,
                "level": 1 if not section.get("parent_section") else 2
            })
        
        return {
            "title": "Table of Contents",
            "entries": toc_entries
        }

    def _extract_glossary(self, sections: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Extract technical terms and create glossary."""
        import re
        
        glossary_terms = {}
        
        for section in sections:
            content = section.get("content", "")
            
            # Look for terms in backticks (likely technical terms)
            code_terms = re.findall(r'`([A-Za-z][A-Za-z0-9_]*)`', content)
            
            for term in code_terms:
                if term not in glossary_terms and len(term) > 2:
                    # Extract context (sentence containing the term)
                    pattern = r'([^.!?]*' + re.escape(f'`{term}`') + r'[^.!?]*[.!?])'
                    context_match = re.search(pattern, content)
                    context = context_match.group(1) if context_match else f"Technical term: {term}"
                    
                    glossary_terms[term] = context.strip()
        
        # Convert to list format
        glossary = [
            {"term": term, "definition": definition}
            for term, definition in sorted(glossary_terms.items())
        ]
        
        return glossary[:20]  # Limit to 20 terms

    def _generate_executive_summary(self, title: str, abstract: str, sections: List[Dict[str, Any]], artifact_type: str) -> Optional[Dict[str, Any]]:
        """Generate executive summary for certain document types."""
        # Only generate for specs and plans
        if artifact_type not in ["spec", "plan"]:
            return None
        
        # Count different section types
        task_sections = sum(1 for s in sections if s.get("type") == "task")
        user_story_sections = sum(1 for s in sections if s.get("type") == "user_story")
        design_sections = sum(1 for s in sections if s.get("type") == "design_decision")
        
        summary = {
            "title": "Executive Summary",
            "overview": abstract,
            "key_metrics": {
                "total_sections": len(sections),
                "implementation_tasks": task_sections,
                "user_stories": user_story_sections,
                "design_decisions": design_sections
            },
            "recommendations": self._generate_recommendations(sections, artifact_type)
        }
        
        return summary

    def _generate_recommendations(self, sections: List[Dict[str, Any]], artifact_type: str) -> List[str]:
        """Generate recommendations based on document analysis."""
        recommendations = []
        
        # Check for missing sections
        section_headings = [s.get("heading", "").lower() for s in sections]
        
        if artifact_type == "spec":
            if not any("requirement" in h for h in section_headings):
                recommendations.append("Consider adding a Requirements section to clarify functional needs")
            if not any("design" in h or "architecture" in h for h in section_headings):
                recommendations.append("Consider adding a Design/Architecture section")
        
        if artifact_type == "plan":
            if not any("timeline" in h or "schedule" in h for h in section_headings):
                recommendations.append("Consider adding a Timeline/Schedule section")
            if not any("resource" in h for h in section_headings):
                recommendations.append("Consider documenting required resources")
        
        return recommendations[:5]  # Limit to 5 recommendations

    def _generate_best_practices(self, sections: List[Dict[str, Any]], artifact_type: str) -> Optional[Dict[str, Any]]:
        """Generate best practices section based on document type."""
        if artifact_type not in ["spec", "plan"]:
            return None
        
        # Extract any existing best practices mentions
        practices = []
        for section in sections:
            content = section.get("content", "")
            if "best practice" in content.lower() or "recommendation" in content.lower():
                # Extract sentences with these keywords
                import re
                sentences = re.split(r'[.!?]', content)
                for sentence in sentences:
                    if "best practice" in sentence.lower() or "recommendation" in sentence.lower():
                        practices.append(sentence.strip())
        
        if not practices:
            return None
        
        return {
            "title": "Best Practices & Recommendations",
            "items": practices[:10]  # Limit to 10 items
        }
