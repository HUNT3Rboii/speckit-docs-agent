import os
from typing import Optional

API_KEY_ENV = "SPECKIT_EXT_API_KEY"
OUTPUT_DIR_ENV = "DOC_OUTPUT_DIR"


def get_api_key() -> str:
    return os.getenv(API_KEY_ENV, "dev-key")


def get_output_dir() -> str:
    return os.getenv(OUTPUT_DIR_ENV, "/tmp/doc-output")


def get_project_name(repo_path: Optional[str] = None) -> str:
    if repo_path:
        return repo_path.split("/")[-1] or "repo"
    return "local-project"
