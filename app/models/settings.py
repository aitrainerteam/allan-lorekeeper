from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class AppSettings(SQLModel, table=True):
    """
    Singleton-ish settings table for a single-novel workflow.
    We always read/write row id=1.
    """

    id: int | None = Field(default=1, primary_key=True)

    oracle_instructions: str = Field(default="", description="Persistent Novel Bible / Oracle instructions text")

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


