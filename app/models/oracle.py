from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import utcnow


class OracleAssistant(SQLModel, table=True):
    """Tracks OpenAI assistants for oracle instructions caching."""
    id: int | None = Field(default=None, primary_key=True)
    assistant_id: str = Field(unique=True, max_length=128)  # OpenAI assistant ID
    instructions_hash: str = Field(unique=True, max_length=64)  # Hash of instructions for change detection
    instructions: str = Field(default="")  # Store instructions for reference
    model: str = Field(default="gpt-4o-mini", max_length=32)

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)


class OracleThread(SQLModel, table=True):
    """Tracks conversation threads for cached oracle interactions."""
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: str = Field(unique=True, index=True, max_length=64)  # Maps to ChatMessage.conversation_id
    thread_id: str = Field(unique=True, max_length=128)  # OpenAI thread ID
    assistant_id: str = Field(index=True, max_length=128)  # Reference to OpenAI assistant ID

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
