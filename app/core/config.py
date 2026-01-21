"""
Application configuration management.

This module handles loading and providing application settings from environment
variables and computed paths. It centralizes configuration management for the
LoreKeeper application.
"""

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
    Load and return application settings from environment variables.

    Loads environment variables from a local .env file if present, then
    constructs paths and retrieves API keys.

    Returns:
        Settings: Frozen dataclass containing all application configuration.
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


