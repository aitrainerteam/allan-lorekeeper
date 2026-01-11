from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.ai.client import add_message_to_thread, get_openai_client, run_assistant
from app.crud.oracle import get_or_create_oracle_assistant, get_or_create_oracle_thread
from app.crud.settings import get_oracle_instructions
from app.models.codex import Act, Character, Concept
from app.models.problems import PlotHole
from app.models.timeline import Event


def build_rag_lite_context(session: Session, *, question: str, limit: int = 8) -> dict[str, Any]:
    like = f"%{question.strip()}%"

    oracle_instructions = get_oracle_instructions(session)

    characters = session.exec(
        select(Character)
        .where(Character.name.like(like) | Character.traits.like(like) | Character.arc.like(like))
        .order_by(Character.importance.desc(), Character.name)
        .limit(limit)
    ).all()
    concepts = session.exec(
        select(Concept)
        .where(Concept.title.like(like) | Concept.description.like(like))
        .order_by(Concept.importance.desc(), Concept.title)
        .limit(limit)
    ).all()
    acts = session.exec(
        select(Act)
        .where(Act.title.like(like) | Act.summary.like(like))
        .order_by(Act.importance.desc(), Act.title)
        .limit(limit)
    ).all()
    events = session.exec(
        select(Event)
        .where(Event.title.like(like) | Event.description.like(like) | Event.ai_notes.like(like))
        .order_by(Event.ai_suggested_order, Event.approx_order)
        .limit(limit)
    ).all()
    holes = session.exec(
        select(PlotHole)
        .where(PlotHole.title.like(like) | PlotHole.description.like(like) | PlotHole.ai_suggestions.like(like))
        .order_by(PlotHole.importance.desc(), PlotHole.created_at.desc())
        .limit(limit)
    ).all()

    # Fallback: if LIKE finds nothing (common), still provide top-level “index” context
    if not (characters or concepts or acts or events or holes):
        characters = session.exec(select(Character).order_by(Character.importance.desc(), Character.name).limit(12)).all()
        concepts = session.exec(select(Concept).order_by(Concept.importance.desc(), Concept.title).limit(12)).all()
        acts = session.exec(select(Act).order_by(Act.importance.desc(), Act.title).limit(12)).all()
        events = session.exec(select(Event).order_by(Event.ai_suggested_order, Event.approx_order).limit(18)).all()
        holes = session.exec(select(PlotHole).order_by(PlotHole.importance.desc(), PlotHole.created_at.desc()).limit(12)).all()

    return {
        "oracle_instructions": oracle_instructions,
        "characters": [
            {
                "name": c.name,
                "traits": c.traits,
                "arc": c.arc,
                "status": c.status,
                "importance": c.importance,
                "incomplete": c.is_incomplete,
            }
            for c in characters
        ],
        "concepts": [
            {"title": c.title, "description": c.description, "status": c.status, "importance": c.importance}
            for c in concepts
        ],
        "acts": [
            {"title": a.title, "summary": a.summary, "status": a.status, "importance": a.importance, "incomplete": a.is_incomplete}
            for a in acts
        ],
        "events": [
            {
                "title": e.title,
                "description": e.description,
                "order": (e.ai_suggested_order or e.approx_order),
                "ai_notes": e.ai_notes,
            }
            for e in events
        ],
        "plot_holes": [
            {
                "title": h.title,
                "description": h.description,
                "status": h.status,
                "importance": h.importance,
                "ai_suggestions": h.ai_suggestions,
            }
            for h in holes
        ],
    }


def answer_story_question(
    *,
    session: Session,
    conversation_id: str,
    question: str,
    context: dict[str, Any],
) -> str:
    """Answer a story question using cached oracle instructions via Assistant API."""
    client = get_openai_client()

    # Get or create assistant for current oracle instructions
    oracle_instructions = context.get("oracle_instructions", "")
    assistant = get_or_create_oracle_assistant(session, oracle_instructions)

    # Get or create thread for this conversation
    thread = get_or_create_oracle_thread(session, conversation_id, assistant.assistant_id)

    # Create filtered context without oracle_instructions (already stored in assistant)
    filtered_context = {k: v for k, v in context.items() if k != "oracle_instructions"}

    # Prepare the user message with question and context
    user_message = {
        "question": question,
        "context": filtered_context,
        "instructions": [
            "Be concise and specific.",
            "When referencing facts, mention which entity it came from (character/concept/act/event/plot hole).",
            "If conflicts exist, point them out explicitly.",
        ],
    }

    # Add the message to the thread
    add_message_to_thread(client, thread.thread_id, json.dumps(user_message), "user")

    # Run the assistant and get response
    try:
        response = run_assistant(client, thread.thread_id, assistant.assistant_id)
        return response.strip()
    except Exception as e:
        return f"(AI error: {type(e).__name__})"


