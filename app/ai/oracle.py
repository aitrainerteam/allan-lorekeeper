"""
AI Oracle for story consultation and question answering.

This module implements the Oracle feature, which provides AI-powered assistance
for story-related questions. It uses OpenAI's Assistant API to maintain conversation
context and provide relevant answers based on the user's existing lore database.
"""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.ai.client import add_message_to_thread, get_openai_client, run_assistant
from app.crud.oracle import get_or_create_oracle_assistant, get_or_create_oracle_thread
from app.crud.settings import get_oracle_instructions
from app.models.bible import BibleSection
from app.models.codex import Act, Character, Concept
from app.models.problems import PlotHole
from app.models.timeline import Event


def build_rag_lite_context(session: Session, *, question: str, limit: int = 8) -> dict[str, Any]:
    """
    Build retrieval-augmented generation context for Oracle questions.

    Searches the database for relevant entities (characters, concepts, acts, events, problems)
    that match the question, providing context for the AI assistant to give informed answers.

    Args:
        session: Database session for entity queries.
        question: The user's question to find relevant context for.
        limit: Maximum number of entities to return per type (default: 8).

    Returns:
        dict: Context dictionary with oracle_instructions and entity lists.
    """
    like = f"%{question.strip()}%"

    oracle_instructions = get_oracle_instructions(session)

    # Query bible sections that match the question
    bible_sections = session.exec(
        select(BibleSection)
        .where(BibleSection.content.like(like) | BibleSection.display_name.like(like))
        .order_by(BibleSection.order)
        .limit(limit)
    ).all()

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
    if not (bible_sections or characters or concepts or acts or events or holes):
        # Include all bible sections as foundational context
        bible_sections = session.exec(
            select(BibleSection).order_by(BibleSection.order)
        ).all()
        characters = session.exec(select(Character).order_by(Character.importance.desc(), Character.name).limit(12)).all()
        concepts = session.exec(select(Concept).order_by(Concept.importance.desc(), Concept.title).limit(12)).all()
        acts = session.exec(select(Act).order_by(Act.importance.desc(), Act.title).limit(12)).all()
        events = session.exec(select(Event).order_by(Event.ai_suggested_order, Event.approx_order).limit(18)).all()
        holes = session.exec(select(PlotHole).order_by(PlotHole.importance.desc(), PlotHole.created_at.desc()).limit(12)).all()

    return {
        "oracle_instructions": oracle_instructions,
        "bible_sections": [
            {"name": s.display_name, "content": s.content[:2000]}
            for s in bible_sections
        ],
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
    except RuntimeError as e:
        # Assistant run failed - return a more user-friendly error
        return f"(AI assistant error: {str(e)})"
    except Exception as e:
        # Generic error handling for unexpected issues
        return f"(AI service unavailable: {type(e).__name__})"


def build_full_story_context(session: Session) -> dict[str, Any]:
    """
    Build comprehensive context from all story data for analysis.
    
    Args:
        session: Database session for entity queries.
        
    Returns:
        dict: Complete story context including all entities and bible sections.
    """
    bible_sections = session.exec(
        select(BibleSection).order_by(BibleSection.order)
    ).all()
    characters = session.exec(
        select(Character).order_by(Character.importance.desc(), Character.name)
    ).all()
    concepts = session.exec(
        select(Concept).order_by(Concept.importance.desc(), Concept.title)
    ).all()
    acts = session.exec(
        select(Act).order_by(Act.importance.desc(), Act.title)
    ).all()
    events = session.exec(
        select(Event).order_by(Event.ai_suggested_order, Event.approx_order)
    ).all()
    existing_holes = session.exec(
        select(PlotHole).order_by(PlotHole.importance.desc(), PlotHole.created_at.desc())
    ).all()
    
    return {
        "bible_sections": [
            {"name": s.display_name, "content": s.content[:4000]}
            for s in bible_sections
        ],
        "characters": [
            {
                "name": c.name,
                "traits": c.traits,
                "arc": c.arc,
                "status": c.status,
                "importance": c.importance,
            }
            for c in characters
        ],
        "concepts": [
            {"title": c.title, "description": c.description, "status": c.status}
            for c in concepts
        ],
        "acts": [
            {"title": a.title, "summary": a.summary, "status": a.status}
            for a in acts
        ],
        "events": [
            {
                "title": e.title,
                "description": e.description,
                "act": e.act,
                "beat": e.beat,
                "ai_notes": e.ai_notes,
            }
            for e in events
        ],
        "existing_plot_holes": [
            {"title": h.title, "description": h.description, "status": h.status}
            for h in existing_holes
        ],
    }


def analyze_novel_for_issues(session: Session, model: str = "gpt-4o-mini") -> list[dict]:
    """
    Analyze the full novel content to identify potential issues.
    
    Queries all story data and asks AI to analyze for plot holes, 
    inconsistencies, and other issues.
    
    Args:
        session: Database session for entity queries.
        model: OpenAI model to use for analysis.
        
    Returns:
        list: List of identified issues with title, description, and kind.
    """
    try:
        client = get_openai_client()
    except Exception:
        return []
    
    # Build comprehensive context from all story data
    context = build_full_story_context(session)
    
    # Check if there's any content to analyze
    has_content = any([
        context.get("bible_sections"),
        context.get("characters"),
        context.get("concepts"),
        context.get("events"),
    ])
    
    if not has_content:
        return []
    
    system = (
        "You are a story analyst. Analyze the provided story content for plot holes, "
        "inconsistencies, and issues. Return STRICT JSON ONLY. No markdown, no commentary."
    )
    
    user_prompt = {
        "task": "Analyze this story for plot holes, inconsistencies, and potential issues",
        "story_context": context,
        "output_schema": {
            "issues": [
                {
                    "title": "str (short, <=80 chars)",
                    "description": "str (detailed explanation)",
                    "kind": "str (one of: plot_hole, continuity, character_motivation, worldbuilding, pacing, concept_issue, other)"
                }
            ]
        },
        "rules": [
            "Focus on logical inconsistencies, contradictions, and gaps in the narrative.",
            "Look for character motivations that don't make sense.",
            "Check for timeline issues or events that contradict each other.",
            "Check for concepts/rules that are applied inconsistently.",
            "Do NOT report issues that already exist in existing_plot_holes.",
            "Only report genuine issues you find, not suggestions for improvement.",
            "Return an empty issues array if no real problems are found.",
            "Each issue title should be concise and specific.",
        ],
    }
    
    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.3,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
        )
        content = (resp.choices[0].message.content or "").strip()
        
        # Strip markdown fences if present
        if content.startswith("```"):
            import re
            content = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        
        parsed = json.loads(content)
        issues = parsed.get("issues") or []
        
        # Validate and normalize the issues
        normalized = []
        for issue in issues:
            if isinstance(issue, dict) and issue.get("title") and issue.get("description"):
                normalized.append({
                    "title": str(issue["title"])[:80],
                    "description": str(issue.get("description", "")),
                    "kind": str(issue.get("kind", "plot_hole")),
                })
        
        return normalized
    except Exception:
        return []


