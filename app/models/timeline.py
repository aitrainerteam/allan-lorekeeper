from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class Event(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=240)
    description: str = Field(default="")

    # Story structure classification (Acts/Beats)
    act: str | None = Field(default=None, index=True, max_length=16)  # "ACT 1" | "ACT 2" | "ACT 3"
    beat: str | None = Field(default=None, index=True, max_length=80)  # e.g. "Inciting Incident"

    # user-provided approximate order (e.g., 10, 20, 30 to allow inserts)
    approx_order: int = Field(default=0, index=True)

    # AI output (Phase 4), stored so UI can sort by it
    ai_suggested_order: int | None = Field(default=None, index=True)
    ai_notes: str = Field(default="")

    status: str = Field(default="draft", index=True, max_length=40)
    importance: int = Field(default=3, index=True, ge=1, le=5)
    is_incomplete: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


