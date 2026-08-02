"""
Shared source_path <-> exception matching predicate, used both to check an
incoming document against the exceptions list (AgenticPipelineService) and
to find existing artifacts that should be removed when a new exception is
added (routes.add_exception).
"""


def path_matches_exception(source_path: str, exception_path: str) -> bool:
    """
    True if source_path is exactly exception_path, or falls under it as a
    folder prefix (e.g. exception ".specify/templates" covers
    ".specify/templates/spec-template.md" but not
    ".specify/templates-old/x.md" - the "+ '/'" boundary check is what
    prevents that kind of accidental prefix collision).
    """
    exception_path = exception_path.rstrip("/")
    return source_path == exception_path or source_path.startswith(exception_path + "/")
