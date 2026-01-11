from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    project_root: Path
    sqlite_path: Path
    openai_api_key: str | None


def get_settings() -> Settings:
    """
    Loads environment variables from a local .env file if present.
    """
    load_dotenv(override=False)

    project_root = Path(__file__).resolve().parents[2]
    sqlite_path = project_root / "lorekeeper.db"

    import os

    return Settings(
        project_root=project_root,
        sqlite_path=sqlite_path,
        openai_api_key=os.getenv("OPENAI_API_KEY") or None,
    )


