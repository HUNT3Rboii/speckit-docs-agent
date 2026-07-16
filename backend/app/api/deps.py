import os
from typing import Optional

API_KEY_ENV = "SPECKIT_EXT_API_KEY"
OUTPUT_DIR_ENV = "DOC_OUTPUT_DIR"
USE_POSTGRES_ENV = "USE_POSTGRES"


def get_api_key() -> str:
    return os.getenv(API_KEY_ENV, "dev-key")


def get_output_dir() -> str:
    return os.getenv(OUTPUT_DIR_ENV, "/tmp/doc-output")


def get_project_name(repo_path: Optional[str] = None) -> str:
    if repo_path:
        return repo_path.split("/")[-1] or "repo"
    return "local-project"


def get_repository():
    """Get the appropriate repository implementation based on environment."""
    use_postgres = os.getenv(USE_POSTGRES_ENV, "true").lower() == "true"
    
    if use_postgres:
        try:
            from app.repositories.postgres_artifact_repo import PostgresArtifactRepository
            return PostgresArtifactRepository()
        except Exception as e:
            print(f"Failed to initialize PostgreSQL repository: {e}")
            print("Falling back to SQLite repository")
    
    from app.repositories.artifact_repo import ArtifactRepository
    return ArtifactRepository()
