from app.services.rendering import RenderingService


def test_build_html_groups_sections_by_type(tmp_path) -> None:
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Release Notes",
        "abstract": "Grouped output",
        "sections": [
            {"heading": "Task 1", "content": "- [x] Ship feature", "type": "task"},
            {"heading": "Story 1", "content": "As a user, I want to view docs, so that I can learn faster.", "type": "user_story"},
            {"heading": "Decision 1", "content": "Use FastAPI.", "type": "design_decision"},
            {"heading": "Notes", "content": "General guidance.", "type": "normal"},
        ],
    }

    html = service._build_html(
        "Release Notes",
        "Grouped output",
        structured_json,
        "task",
        "specs/001-documentation-agent/tasks/001.md",
        "abc123",
    )

    assert "Table of contents" in html
    assert "Task sections" in html
    assert "User story sections" in html
    assert "Design decision sections" in html
    assert "Other sections" in html
    assert "Ship feature" in html
