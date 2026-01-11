from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: str = Field(index=True, max_length=64)
    role: str = Field(index=True, max_length=16)  # "user" | "assistant" | "system"
    content: str = Field(default="")

    created_at: datetime = Field(default_factory=utcnow, index=True)


