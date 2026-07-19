from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_api_key
from app.models.schemas import AgentTransformRequest, AgentTransformResponse

router = APIRouter()


def require_api_key_header(authorization: str | None = None) -> None:
    """Validate API key from header."""
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


@router.post("/api/agent/transform", response_model=AgentTransformResponse)
def agent_transform(payload: AgentTransformRequest) -> Dict[str, Any]:
    """
    Endpoint for IDE agent to submit transformation results.
    
    Flow:
    1. Backend needs to transform markdown
    2. Backend calls IDE extension via this endpoint (provides markdown)
    3. Extension invokes IDE agent (Copilot, Claude, etc.)
    4. Extension posts AI result back to this endpoint
    5. Backend uses AI result for PDF generation
    
    This creates a bridge between backend and IDE agent.
    """
    # For now, just acknowledge receipt
    # In production, this would queue the result for the waiting request
    return {
        "status": "received",
        "message": "AI transformation result received",
        "result": {
            "title": payload.title,
            "abstract": payload.abstract,
            "sections": payload.sections
        }
    }
