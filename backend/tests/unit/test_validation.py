from app.services.validation import ValidationService, ValidationError


def test_validation_rejects_missing_headings() -> None:
    service = ValidationService()
    structured_json = {"title": "Test", "abstract": "Test", "sections": [{"heading": "Intro", "level": 1, "content": "Body", "type": "normal"}]}
    try:
        service.validate("specs/001-feature/spec.md", structured_json)
    except ValidationError as exc:
        assert "Missing headings" in str(exc)
    else:
        raise AssertionError("expected validation error")
