from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class Tag(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True, max_length=80)

    created_at: datetime = Field(default_factory=utcnow)


class Tagging(SQLModel, table=True):
    """
    Simple polymorphic tagging for local-first use:
    - entity_type: 'character' | 'concept' | 'act' | 'event' | 'plothole' (enforced at app layer)
    - entity_id: the table PK
    """

    id: int | None = Field(default=None, primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", index=True)
    entity_type: str = Field(index=True, max_length=32)
    entity_id: int = Field(index=True)

    created_at: datetime = Field(default_factory=utcnow)


class Character(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=200)
    traits: str = Field(default="", description="Free-form traits/notes")
    arc: str = Field(default="", description="Character arc notes")

    # Shiftable categories
    status: str = Field(default="draft", index=True, max_length=40)
    importance: int = Field(default=3, index=True, ge=1, le=5)
    is_incomplete: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Concept(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=240)
    description: str = Field(default="")

    status: str = Field(default="draft", index=True, max_length=40)
    importance: int = Field(default=3, index=True, ge=1, le=5)
    is_incomplete: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Act(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=240)
    summary: str = Field(default="")

    status: str = Field(default="draft", index=True, max_length=40)
    importance: int = Field(default=3, index=True, ge=1, le=5)
    is_incomplete: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


