from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class PlotHole(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=240)
    description: str = Field(default="")

    # Generalized "problem type" (we keep the table name for backwards compatibility)
    kind: str = Field(default="plot_hole", index=True, max_length=40)

    # Optional link to another entity (app-enforced)
    related_entity_type: str | None = Field(default=None, index=True, max_length=32)
    related_entity_id: int | None = Field(default=None, index=True)

    status: str = Field(default="open", index=True, max_length=40)
    importance: int = Field(default=3, index=True, ge=1, le=5)

    # AI output (Phase 4)
    ai_suggestions: str = Field(default="")

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


