from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_api_key
from app.models.schemas import TransformationModeRequest, TransformationModeResponse, ConfigStatusResponse

router = APIRouter()


def require_api_key_header(authorization: str | None = None) -> None:
    """Validate API key from header."""
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


# Global state for transformation mode (in production, store in database)
_transformation_mode = os.getenv("USE_AI_TRANSFORM", "true").lower() == "true"


@router.post("/api/config/transformation-mode", response_model=TransformationModeResponse)
def set_transformation_mode(payload: TransformationModeRequest, _=Depends(require_api_key_header)) -> Dict[str, Any]:
    """
    Toggle between AI-powered and rule-based transformation modes.
    
    Modes:
    - "ai" or "agentic": Use IDE agent for intelligent transformation
    - "rule-based" or "classic": Use pattern matching and heuristics
    """
    global _transformation_mode
    
    mode = payload.mode.lower()
    if mode in ["ai", "agentic", "ai-powered"]:
        _transformation_mode = True
        mode_name = "AI-Powered"
        mode_emoji = "✨"
        description = "Using your IDE's AI model for intelligent transformation"
    elif mode in ["rule-based", "classic", "heuristic"]:
        _transformation_mode = False
        mode_name = "Rule-Based"
        mode_emoji = "⚡"
        description = "Using pattern matching and heuristics"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode: {mode}. Use 'ai' or 'rule-based'"
        )
    
    return {
        "status": "success",
        "mode": mode_name.lower().replace("-", "_"),
        "mode_display": f"{mode_name} {mode_emoji}",
        "description": description,
        "ai_enabled": _transformation_mode,
        "message": f"Transformation mode updated to: {mode_name} {mode_emoji}"
    }


@router.get("/api/config/transformation-mode", response_model=TransformationModeResponse)
def get_transformation_mode(_=Depends(require_api_key_header)) -> Dict[str, Any]:
    """Get the current transformation mode."""
    global _transformation_mode
    
    if _transformation_mode:
        return {
            "status": "success",
            "mode": "ai_powered",
            "mode_display": "AI-Powered ✨",
            "description": "Using your IDE's AI model for intelligent transformation",
            "ai_enabled": True,
            "message": "Current mode: AI-Powered ✨"
        }
    else:
        return {
            "status": "success",
            "mode": "rule_based",
            "mode_display": "Rule-Based ⚡",
            "description": "Using pattern matching and heuristics",
            "ai_enabled": False,
            "message": "Current mode: Rule-Based ⚡"
        }


@router.get("/api/config/status", response_model=ConfigStatusResponse)
def get_config_status(_=Depends(require_api_key_header)) -> Dict[str, Any]:
    """Get overall configuration status."""
    global _transformation_mode
    
    return {
        "transformation_mode": {
            "ai_enabled": _transformation_mode,
            "mode": "ai_powered" if _transformation_mode else "rule_based",
            "mode_display": "AI-Powered ✨" if _transformation_mode else "Rule-Based ⚡"
        },
        "backend_version": "2.0.0",
        "features": {
            "ai_transformation": True,
            "rule_based_fallback": True,
            "file_watching": True,
            "git_hooks": True,
            "deduplication": True,
            "version_tracking": True
        }
    }


def get_transformation_mode_flag() -> bool:
    """Helper function for other services to check mode."""
    global _transformation_mode
    return _transformation_mode
