import pytest

from app.services.validation import ValidationService, ValidationError


def test_validation_accepts_document_with_sections() -> None:
    """Heading coverage is deliberately not enforced.

    The AI commonly promotes the source document's first markdown heading to
    the document title rather than emitting it as a section, so requiring every
    source heading to reappear as a section rejected perfectly good output.
    """
    service = ValidationService()
    structured_json = {
        "title": "Test",
        "abstract": "Test",
        "sections": [{"heading": "Intro", "level": 1, "content": "Body", "type": "normal"}],
    }

    service.validate("specs/001-feature/spec.md", structured_json)


def test_validation_rejects_document_without_sections() -> None:
    service = ValidationService()

    with pytest.raises(ValidationError) as exc_info:
        service.validate("specs/001-feature/spec.md", {"title": "Test", "abstract": "Test", "sections": []})

    assert "at least one section" in str(exc_info.value)


def test_validation_rejects_task_content_typed_as_normal() -> None:
    service = ValidationService()
    structured_json = {
        "title": "Test",
        "abstract": "Test",
        "sections": [
            {"heading": "Tasks", "level": 1, "content": "- [ ] Do the thing", "type": "normal"},
        ],
    }

    with pytest.raises(ValidationError) as exc_info:
        service.validate("specs/001-feature/tasks.md", structured_json)

    assert "Misclassified" in str(exc_info.value)
    assert exc_info.value.details == ["Tasks"]
