from __future__ import annotations

import hashlib

from sqlmodel import Session, select

from app.ai.client import (
    create_oracle_assistant,
    delete_oracle_assistant,
    get_openai_client,
    update_oracle_assistant,
)
from app.models.common import utcnow
from app.models.oracle import OracleAssistant, OracleThread


def get_instructions_hash(instructions: str) -> str:
    """Generate a hash of the instructions for change detection."""
    return hashlib.sha256(instructions.strip().encode()).hexdigest()[:16]


def get_or_create_oracle_assistant(session: Session, instructions: str, model: str = "gpt-4o-mini") -> OracleAssistant:
    """Get or create an assistant for the given instructions."""
    instructions = instructions.strip()
    instructions_hash = get_instructions_hash(instructions)

    # Check if we already have an assistant with these instructions
    assistant = session.exec(
        select(OracleAssistant).where(OracleAssistant.instructions_hash == instructions_hash)
    ).first()

    if assistant:
        return assistant

    # Check if we need to update an existing assistant
    existing_assistant = session.exec(
        select(OracleAssistant).order_by(OracleAssistant.updated_at.desc())
    ).first()

    client = get_openai_client()

    if existing_assistant:
        # Update the existing assistant with new instructions
        try:
            update_oracle_assistant(client, existing_assistant.assistant_id, instructions)
            existing_assistant.instructions_hash = instructions_hash
            existing_assistant.instructions = instructions
            existing_assistant.updated_at = utcnow()
            session.add(existing_assistant)
            session.commit()
            session.refresh(existing_assistant)
            return existing_assistant
        except Exception:
            # If update fails, create a new one
            pass

    # Create a new assistant
    try:
        assistant_id = create_oracle_assistant(client, instructions, model)
        assistant = OracleAssistant(
            assistant_id=assistant_id,
            instructions_hash=instructions_hash,
            instructions=instructions,
            model=model,
        )
        session.add(assistant)
        session.commit()
        session.refresh(assistant)
        return assistant
    except Exception as e:
        raise RuntimeError(f"Failed to create oracle assistant: {e}")


def get_oracle_thread(session: Session, conversation_id: str, assistant_id: str) -> OracleThread | None:
    """Get an existing thread for a conversation."""
    return session.exec(
        select(OracleThread).where(
            OracleThread.conversation_id == conversation_id,
            OracleThread.assistant_id == assistant_id,
        )
    ).first()


def create_oracle_thread(session: Session, conversation_id: str, assistant_id: str) -> OracleThread:
    """Create a new thread for a conversation."""
    from app.ai.client import create_thread

    client = get_openai_client()
    thread_id = create_thread(client)

    thread = OracleThread(
        conversation_id=conversation_id,
        thread_id=thread_id,
        assistant_id=assistant_id,
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return thread


def get_or_create_oracle_thread(session: Session, conversation_id: str, assistant_id: str) -> OracleThread:
    """Get or create a thread for a conversation."""
    thread = get_oracle_thread(session, conversation_id, assistant_id)
    if thread:
        return thread
    return create_oracle_thread(session, conversation_id, assistant_id)


def cleanup_old_assistants(session: Session, keep_recent: int = 3) -> None:
    """Clean up old assistants, keeping only the most recent ones."""
    # Get all assistants ordered by creation date (newest first)
    assistants = session.exec(
        select(OracleAssistant).order_by(OracleAssistant.created_at.desc())
    ).all()

    if len(assistants) <= keep_recent:
        return

    # Delete old assistants from OpenAI and database
    client = get_openai_client()
    for assistant in assistants[keep_recent:]:
        try:
            delete_oracle_assistant(client, assistant.assistant_id)
            session.delete(assistant)
        except Exception:
            # Continue if deletion fails
            pass

    session.commit()
