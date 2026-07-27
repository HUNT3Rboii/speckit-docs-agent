from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


class AIDiagramService:
    """
    AI-powered diagram generation service.
    
    Uses IDE's AI or external API to create intelligent diagrams from text descriptions.
    """

    def __init__(self):
        self.use_ai = True

    def enhance_diagram_with_ai(self, diagram_spec: Dict[str, Any], full_context: str) -> Dict[str, Any]:
        """
        Use AI to create a better diagram from the specification.
        
        The AI understands the full document context and creates
        contextually relevant diagrams.
        """
        diagram_type = diagram_spec.get("type")
        section_content = diagram_spec.get("section_content", "")
        
        # Build AI prompt for diagram generation
        prompt = self._build_diagram_prompt(diagram_type, diagram_spec, section_content, full_context)
        
        # TODO: Call IDE agent or external AI
        # For now, return the basic spec with enhanced flag
        diagram_spec["ai_enhanced"] = True
        diagram_spec["mermaid_code"] = self._generate_enhanced_mermaid(diagram_spec)
        
        return diagram_spec

    def _build_diagram_prompt(self, diagram_type: str, spec: Dict[str, Any], section: str, context: str) -> str:
        """Build AI prompt for diagram generation."""
        
        base_prompt = f"""You are an expert at creating technical diagrams for documentation.

Document Context:
{context[:1000]}  # First 1000 chars of context

Section Content:
{section}

Task: Create a {diagram_type} diagram in Mermaid.js format.

Requirements:
1. Analyze the content and extract key components/entities/flows
2. Create a clear, professional diagram
3. Use appropriate Mermaid syntax for {diagram_type}
4. Include meaningful labels and relationships
5. Keep it concise but complete

Return ONLY the Mermaid code, no explanations."""

        return base_prompt

    def _generate_enhanced_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced Mermaid diagram code."""
        diagram_type = spec.get("type")
        
        if diagram_type == "architecture":
            return self._enhanced_architecture_mermaid(spec)
        elif diagram_type == "api_endpoint":
            return self._enhanced_api_mermaid(spec)
        elif diagram_type == "data_model":
            return self._enhanced_data_model_mermaid(spec)
        elif diagram_type == "sequence":
            return self._enhanced_sequence_mermaid(spec)
        elif diagram_type == "state_machine":
            return self._enhanced_state_mermaid(spec)
        
        return ""

    def _enhanced_architecture_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced architecture diagram."""
        components = spec.get("components", [])
        
        mermaid = "graph TB\n"
        mermaid += "    %% System Architecture Diagram\n"
        
        # Group components by layer if possible
        frontend = [c for c in components if any(x in c.lower() for x in ["ui", "frontend", "client", "web"])]
        backend = [c for c in components if any(x in c.lower() for x in ["api", "backend", "service", "server"])]
        data = [c for c in components if any(x in c.lower() for x in ["database", "db", "storage", "cache"])]
        
        # Add frontend components
        if frontend:
            mermaid += "\n    subgraph Frontend\n"
            for comp in frontend:
                safe_id = comp.replace(" ", "_")
                mermaid += f"        {safe_id}[{comp}]\n"
            mermaid += "    end\n"
        
        # Add backend components
        if backend:
            mermaid += "\n    subgraph Backend\n"
            for comp in backend:
                safe_id = comp.replace(" ", "_")
                mermaid += f"        {safe_id}[{comp}]\n"
            mermaid += "    end\n"
        
        # Add data components
        if data:
            mermaid += "\n    subgraph Data Layer\n"
            for comp in data:
                safe_id = comp.replace(" ", "_")
                mermaid += f"        {safe_id}[(
{comp})]\n"
            mermaid += "    end\n"
        
        # Add connections
        if frontend and backend:
            mermaid += f"\n    {frontend[0].replace(' ', '_')} -->|HTTP/REST| {backend[0].replace(' ', '_')}\n"
        if backend and data:
            mermaid += f"    {backend[0].replace(' ', '_')} -->|Query| {data[0].replace(' ', '_')}\n"
        
        return mermaid

    def _enhanced_api_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced API endpoint diagram."""
        endpoints = spec.get("endpoints", [])
        
        mermaid = "graph LR\n"
        mermaid += "    %% API Endpoint Diagram\n"
        mermaid += "    Client([Client Application])\n"
        mermaid += "    API[API Gateway]\n"
        mermaid += "    Client --> API\n\n"
        
        # Group by HTTP method
        by_method = {}
        for ep in endpoints:
            method = ep.get("method", "GET")
            if method not in by_method:
                by_method[method] = []
            by_method[method].append(ep)
        
        # Add endpoint groups
        for method, eps in by_method.items():
            mermaid += f"    subgraph {method} Endpoints\n"
            for i, ep in enumerate(eps):
                path = ep.get("path", "/")
                safe_id = f"{method}{i}"
                mermaid += f"        {safe_id}[\"{path}\"]\n"
                mermaid += f"        API -->|{method}| {safe_id}\n"
            mermaid += "    end\n\n"
        
        return mermaid

    def _enhanced_data_model_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced data model diagram."""
        entities = spec.get("entities", [])
        
        mermaid = "erDiagram\n"
        mermaid += "    %% Entity Relationship Diagram\n"
        
        for entity in entities:
            mermaid += f"\n    {entity} {{\n"
            mermaid += f"        uuid id PK\n"
            mermaid += f"        timestamp created_at\n"
            mermaid += f"        timestamp updated_at\n"
            mermaid += f"    }}\n"
        
        # Add relationships (inferred from common patterns)
        for i in range(len(entities) - 1):
            mermaid += f"    {entities[i]} ||--o{{ {entities[i+1]} : has\n"
        
        return mermaid

    def _enhanced_sequence_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced sequence diagram."""
        steps = spec.get("steps", [])
        
        mermaid = "sequenceDiagram\n"
        mermaid += "    %% Process Flow Diagram\n"
        mermaid += "    autonumber\n"
        mermaid += "    participant User\n"
        mermaid += "    participant Client\n"
        mermaid += "    participant Server\n"
        mermaid += "    participant Database\n\n"
        
        for i, step in enumerate(steps):
            # Alternate between actors
            if i % 4 == 0:
                mermaid += f"    User->>Client: {step}\n"
            elif i % 4 == 1:
                mermaid += f"    Client->>Server: {step}\n"
            elif i % 4 == 2:
                mermaid += f"    Server->>Database: {step}\n"
            else:
                mermaid += f"    Database-->>Server: {step}\n"
        
        return mermaid

    def _enhanced_state_mermaid(self, spec: Dict[str, Any]) -> str:
        """Generate enhanced state machine diagram."""
        states = spec.get("states", [])
        
        mermaid = "stateDiagram-v2\n"
        mermaid += "    %% State Machine Diagram\n"
        mermaid += "    [*] --> " + states[0] + "\n\n"
        
        for i in range(len(states) - 1):
            transition = f"{states[i]} --> {states[i+1]}"
            mermaid += f"    {transition}: transition\n"
        
        if states:
            mermaid += f"\n    {states[-1]} --> [*]: complete\n"
        
        # Add notes for important states
        if len(states) > 2:
            mermaid += f"\n    note right of {states[len(states)//2]}\n"
            mermaid += f"        Critical state\n"
            mermaid += f"    end note\n"
        
        return mermaid

    def generate_custom_diagram(self, description: str, diagram_type: str) -> Optional[str]:
        """
        Generate custom diagram from natural language description.
        
        Example:
        "Create a diagram showing user authentication flow with OAuth"
        → Generates sequence diagram
        """
        # This would call AI to interpret the description and generate diagram
        # For now, return placeholder
        return None
