import os

from app.services.agent_transform import AgentTransformService


def test_agent_transform_builds_structured_sections() -> None:
    service = AgentTransformService()
    result = service.transform(
        "specs/001-documentation-agent/tasks/001.md",
        "# Task 1\n\n- [x] Build the agent pipeline\n\n## Notes\nUse the new agent step.",
        "task",
    )

    assert result["title"] == "Task 1"
    assert result["sections"][0]["type"] == "task"
    assert len(result["sections"]) >= 1


def test_agent_transform_falls_back_when_no_model_endpoint_is_configured(monkeypatch) -> None:
    monkeypatch.delenv("SPECKIT_MODEL_ENDPOINT", raising=False)
    service = AgentTransformService(model_endpoint=None)
    result = service.transform("specs/001-documentation-agent/spec.md", "# Overview\n\nThis is a sample.", "spec")

    assert result["title"] == "Overview"
    assert result["sections"][0]["type"] == "normal"
