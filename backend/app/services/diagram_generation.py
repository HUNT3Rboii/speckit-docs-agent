from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from enum import Enum


class DiagramType(Enum):
    """Types of diagrams that can be generated."""
    ARCHITECTURE = "architecture"
    SEQUENCE = "sequence"
    FLOWCHART = "flowchart"
    API_ENDPOINT = "api_endpoint"
    DATA_MODEL = "data_model"
    STATE_MACHINE = "state_machine"
    COMPONENT = "component"
    DEPLOYMENT = "deployment"


class DiagramGenerationService:
    """
    AI-powered diagram generation service.
    
    Analyzes document content and automatically generates relevant diagrams:
    - Architecture diagrams for system design
    - Sequence diagrams for workflows
    - API endpoint diagrams
    - Data model diagrams
    - State machines
    - Component diagrams
    - Deployment diagrams
    """

    def __init__(self):
        self.mermaid_enabled = True  # Use Mermaid.js for diagram generation

    def analyze_content_for_diagrams(self, sections: List[Dict[str, Any]], artifact_type: str) -> List[Dict[str, Any]]:
        """
        Analyze document sections and determine what diagrams to generate.
        
        Returns list of diagram specifications with type, title, and content.
        """
        diagrams = []
        
        for section in sections:
            heading = section.get("heading", "").lower()
            content = section.get("content", "")
            section_type = section.get("type", "normal")
            
            # Architecture diagrams
            if any(keyword in heading for keyword in ["architecture", "system design", "components", "structure"]):
                diagram = self._suggest_architecture_diagram(section, content)
                if diagram:
                    diagrams.append(diagram)
            
            # API diagrams
            if any(keyword in heading for keyword in ["api", "endpoints", "routes", "rest"]):
                diagram = self._suggest_api_diagram(section, content)
                if diagram:
                    diagrams.append(diagram)
            
            # Data model diagrams
            if any(keyword in heading for keyword in ["data model", "database", "schema", "entities"]):
                diagram = self._suggest_data_model_diagram(section, content)
                if diagram:
                    diagrams.append(diagram)
            
            # Workflow/sequence diagrams
            if any(keyword in heading for keyword in ["workflow", "process", "flow", "sequence"]):
                diagram = self._suggest_sequence_diagram(section, content)
                if diagram:
                    diagrams.append(diagram)
            
            # State machine diagrams
            if any(keyword in heading for keyword in ["states", "lifecycle", "state machine"]):
                diagram = self._suggest_state_diagram(section, content)
                if diagram:
                    diagrams.append(diagram)
        
        return diagrams

    def _suggest_architecture_diagram(self, section: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
        """Suggest architecture diagram based on content analysis."""
        # Extract components mentioned
        components = self._extract_components(content)
        if len(components) < 2:
            return None
        
        return {
            "type": DiagramType.ARCHITECTURE.value,
            "title": f"System Architecture - {section.get('heading', 'Overview')}",
            "section_ref": section.get("heading"),
            "needs_ai_generation": True,
            "components": components,
            "description": "Auto-generated architecture diagram showing system components and their relationships"
        }

    def _suggest_api_diagram(self, section: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
        """Suggest API endpoint diagram."""
        # Extract API endpoints
        endpoints = self._extract_api_endpoints(content)
        if not endpoints:
            return None
        
        return {
            "type": DiagramType.API_ENDPOINT.value,
            "title": f"API Endpoints - {section.get('heading', 'API')}",
            "section_ref": section.get("heading"),
            "needs_ai_generation": True,
            "endpoints": endpoints,
            "description": "Auto-generated API endpoint reference diagram"
        }

    def _suggest_data_model_diagram(self, section: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
        """Suggest data model/ER diagram."""
        # Extract entities and relationships
        entities = self._extract_entities(content)
        if len(entities) < 2:
            return None
        
        return {
            "type": DiagramType.DATA_MODEL.value,
            "title": f"Data Model - {section.get('heading', 'Schema')}",
            "section_ref": section.get("heading"),
            "needs_ai_generation": True,
            "entities": entities,
            "description": "Auto-generated data model diagram"
        }

    def _suggest_sequence_diagram(self, section: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
        """Suggest sequence/workflow diagram."""
        # Extract workflow steps
        steps = self._extract_workflow_steps(content)
        if len(steps) < 3:
            return None
        
        return {
            "type": DiagramType.SEQUENCE.value,
            "title": f"Workflow - {section.get('heading', 'Process')}",
            "section_ref": section.get("heading"),
            "needs_ai_generation": True,
            "steps": steps,
            "description": "Auto-generated sequence diagram showing process flow"
        }

    def _suggest_state_diagram(self, section: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
        """Suggest state machine diagram."""
        # Extract states and transitions
        states = self._extract_states(content)
        if len(states) < 2:
            return None
        
        return {
            "type": DiagramType.STATE_MACHINE.value,
            "title": f"State Machine - {section.get('heading', 'States')}",
            "section_ref": section.get("heading"),
            "needs_ai_generation": True,
            "states": states,
            "description": "Auto-generated state machine diagram"
        }

    def _extract_components(self, content: str) -> List[str]:
        """Extract system components from content."""
        components = []
        
        # Look for common component patterns
        patterns = [
            r'\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\s+(?:service|component|module|layer)\b',
            r'\b(?:service|component|module):\s+([A-Za-z]+)',
            r'`([A-Z][a-z]+(?:[A-Z][a-z]+)*)`'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            components.extend(matches)
        
        # Deduplicate and return
        return list(set(components))[:10]  # Limit to 10 components

    def _extract_api_endpoints(self, content: str) -> List[Dict[str, str]]:
        """Extract API endpoints from content."""
        endpoints = []
        
        # Match patterns like: GET /api/users, POST /users, etc.
        pattern = r'\b(GET|POST|PUT|DELETE|PATCH)\s+(/[^\s]+)'
        matches = re.findall(pattern, content, re.IGNORECASE)
        
        for method, path in matches:
            endpoints.append({"method": method.upper(), "path": path})
        
        return endpoints[:20]  # Limit to 20 endpoints

    def _extract_entities(self, content: str) -> List[str]:
        """Extract data entities from content."""
        entities = []
        
        # Look for entity patterns
        patterns = [
            r'\b([A-Z][a-z]+)\s+(?:entity|table|model|class)\b',
            r'\b(?:entity|table|model):\s+([A-Za-z]+)',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            entities.extend(matches)
        
        return list(set(entities))[:15]  # Limit to 15 entities

    def _extract_workflow_steps(self, content: str) -> List[str]:
        """Extract workflow steps from content."""
        steps = []
        
        # Look for numbered lists or bullet points
        patterns = [
            r'^\d+\.\s+(.+)$',
            r'^[-*]\s+(.+)$',
            r'^Step \d+:\s+(.+)$'
        ]
        
        for line in content.split('\n'):
            for pattern in patterns:
                match = re.match(pattern, line.strip())
                if match:
                    steps.append(match.group(1))
        
        return steps[:15]  # Limit to 15 steps

    def _extract_states(self, content: str) -> List[str]:
        """Extract states from content."""
        states = []
        
        # Look for state patterns
        patterns = [
            r'\b([A-Z][a-z]+)\s+state\b',
            r'\bstate:\s+([A-Za-z]+)',
            r'\b(pending|active|completed|failed|cancelled)\b'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            states.extend(matches)
        
        return list(set(states))[:10]  # Limit to 10 states

    def generate_mermaid_diagram(self, diagram_spec: Dict[str, Any]) -> str:
        """
        Generate Mermaid.js diagram code based on specification.
        This will be enhanced by AI to create better diagrams.
        """
        diagram_type = diagram_spec.get("type")
        
        if diagram_type == DiagramType.ARCHITECTURE.value:
            return self._generate_architecture_mermaid(diagram_spec)
        elif diagram_type == DiagramType.API_ENDPOINT.value:
            return self._generate_api_mermaid(diagram_spec)
        elif diagram_type == DiagramType.DATA_MODEL.value:
            return self._generate_data_model_mermaid(diagram_spec)
        elif diagram_type == DiagramType.SEQUENCE.value:
            return self._generate_sequence_mermaid(diagram_spec)
        elif diagram_type == DiagramType.STATE_MACHINE.value:
            return self._generate_state_mermaid(diagram_spec)
        
        return ""

    def _generate_architecture_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate architecture diagram in Mermaid format."""
        components = spec.get("components", [])
        if not components:
            return ""
        
        mermaid = "graph TB\n"
        for i, comp in enumerate(components):
            safe_id = comp.replace(" ", "_")
            mermaid += f"    {safe_id}[{comp}]\n"
        
        # Add some connections (will be enhanced by AI)
        if len(components) > 1:
            for i in range(len(components) - 1):
                comp1 = components[i].replace(" ", "_")
                comp2 = components[i+1].replace(" ", "_")
                mermaid += f"    {comp1} --> {comp2}\n"
        
        return mermaid

    def _generate_api_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate API diagram in Mermaid format."""
        endpoints = spec.get("endpoints", [])
        if not endpoints:
            return ""
        
        mermaid = "graph LR\n"
        mermaid += "    Client[Client]\n"
        
        for i, endpoint in enumerate(endpoints):
            method = endpoint.get("method", "GET")
            path = endpoint.get("path", "/")
            safe_id = f"EP{i}"
            mermaid += f"    {safe_id}[\"{method} {path}\"]\n"
            mermaid += f"    Client --> {safe_id}\n"
        
        return mermaid

    def _generate_data_model_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate data model diagram in Mermaid format."""
        entities = spec.get("entities", [])
        if not entities:
            return ""
        
        mermaid = "erDiagram\n"
        for entity in entities:
            mermaid += f"    {entity} {{\n"
            mermaid += f"        string id\n"
            mermaid += f"    }}\n"
        
        return mermaid

    def _generate_sequence_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate sequence diagram in Mermaid format."""
        steps = spec.get("steps", [])
        if not steps:
            return ""
        
        mermaid = "sequenceDiagram\n"
        mermaid += "    participant User\n"
        mermaid += "    participant System\n"
        
        for i, step in enumerate(steps):
            actor = "User" if i % 2 == 0 else "System"
            target = "System" if i % 2 == 0 else "User"
            mermaid += f"    {actor}->>{ target}: {step}\n"
        
        return mermaid

    def _generate_state_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate state machine diagram in Mermaid format."""
        states = spec.get("states", [])
        if not states:
            return ""
        
        mermaid = "stateDiagram-v2\n"
        mermaid += "    [*] --> " + states[0] + "\n"
        
        for i in range(len(states) - 1):
            mermaid += f"    {states[i]} --> {states[i+1]}\n"
        
        if states:
            mermaid += f"    {states[-1]} --> [*]\n"
        
        return mermaid
