from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class BibleSection(SQLModel, table=True):
    """Represents a section of the novel bible that can be edited incrementally."""
    id: int | None = Field(default=None, primary_key=True)
    section_name: str = Field(max_length=128, index=True)  # e.g., "I. The World", "II. Metaphysical System"
    display_name: str = Field(max_length=256)  # e.g., "I. The World", "II. Metaphysical System"
    content: str = Field(default="")  # The actual section content
    order: int = Field(default=0, index=True)  # For ordering sections

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
