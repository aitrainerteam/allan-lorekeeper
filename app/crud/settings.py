"""
CRUD operations for application settings.

This module provides database operations for managing global application settings,
particularly the Oracle AI instructions that guide the AI assistant's behavior.
"""

from __future__ import annotations

from sqlmodel import Session

from app.models.common import utcnow
from app.models.settings import AppSettings


SETTINGS_ID = 1


def get_app_settings(session: Session) -> AppSettings:
    """
    Get or create the singleton application settings record.

    Retrieves the global settings from the database, creating a default
    record if one doesn't exist.

    Args:
        session: Database session.

    Returns:
        AppSettings: The application settings record.
    """
    s = session.get(AppSettings, SETTINGS_ID)
    if s:
        return s
    s = AppSettings(id=SETTINGS_ID, oracle_instructions="")
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


def get_oracle_instructions(session: Session) -> str:
    """
    Get the current Oracle AI instructions.

    Args:
        session: Database session.

    Returns:
        str: The Oracle instructions text, stripped of whitespace.
    """
    s = get_app_settings(session)
    return (s.oracle_instructions or "").strip()


def set_oracle_instructions(session: Session, text: str) -> AppSettings:
    """
    Update the Oracle AI instructions.

    Args:
        session: Database session.
        text: New instructions text.

    Returns:
        AppSettings: Updated settings record.
    """
    s = get_app_settings(session)
    s.oracle_instructions = text or ""
    s.updated_at = utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


