from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app.ai.entity_extractor import extract_entities_from_text
from app.ai.oracle import answer_story_question, build_rag_lite_context
from app.core.config import get_settings
from app.core.db import get_session
from app.crud.auto_entities import persist_extracted_entities
from app.crud.oracle import cleanup_old_assistants
from app.crud.settings import get_oracle_instructions, set_oracle_instructions
from app.models.bible import BibleSection
from app.models.chat import ChatMessage
from app.models.codex import Act, Character, Concept
from app.models.common import utcnow
from app.models.problems import PlotHole
from app.models.timeline import Event
from app.web.mentions import linkify_mentions


router = APIRouter(prefix="/chat", tags=["chat"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()


def _base_ctx(request: Request) -> dict:
    return {"request": request, "db_path": str(settings.sqlite_path)}


def _get_conversation_id(request: Request) -> str:
    cid = request.cookies.get("lk_conversation_id")
    if cid:
        return cid
    return uuid.uuid4().hex


def _is_question(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    if "?" in t:
        return True
    starters = (
        "who",
        "what",
        "when",
        "where",
        "why",
        "how",
        "can ",
        "could ",
        "should ",
        "does ",
        "do ",
        "did ",
        "is ",
        "are ",
        "will ",
        "would ",
    )
    return t.lower().startswith(starters)


def _should_extract_entities(text: str) -> bool:
    """Determine if we should extract and create entities from this message."""
    t = (text or "").strip().lower()
    if not t:
        return False

    # Always extract if user explicitly requests creation
    creation_keywords = [
        "create a", "create an", "add a", "add an", "new character", "new concept",
        "new event", "new plot hole", "new issue", "new problem", "add character",
        "add concept", "add event", "add plot hole", "add issue", "add problem"
    ]
    if any(keyword in t for keyword in creation_keywords):
        return True

    # Don't extract entities from questions (unless they contain explicit creation commands)
    if _is_question(text):
        return False

    # Extract from statements that appear to be providing story content
    return True


def _mention(name: str) -> str:
    name = (name or "").strip()
    return f"@{{{name}}}" if name else ""


def _format_entity_summary(summary: dict) -> str:
    created = (summary or {}).get("created") or {}
    updated = (summary or {}).get("updated") or {}

    lines: list[str] = []

    def add_block(title: str, block: dict) -> None:
        items: list[str] = []
        for label, key in [
            ("Character", "characters"),
            ("Concept", "concepts"),
            ("Event", "events"),
            ("Plot Hole", "plot_holes"),
        ]:
            for name in block.get(key) or []:
                m = _mention(str(name))
                if m:
                    items.append(f"- {label}: {m}")
        if items:
            lines.append(title)
            lines.extend(items)

    add_block("Created from your message:", created)
    add_block("Matched existing (may be unchanged):", updated)
    return "\n".join(lines).strip()


def _generate_novel_summary(session: Session) -> str:
    """Generate a comprehensive novel summary from all stored data."""
    lines = []

    # Header
    lines.append("=" * 80)
    lines.append("LOREKEEPER NOVEL SUMMARY")
    lines.append("=" * 80)
    lines.append("")

    # Bible Sections
    bible_sections = session.exec(select(BibleSection).order_by(BibleSection.order)).all()
    if bible_sections:
        lines.append("📖 BIBLE / WORLD BUILDING")
        lines.append("-" * 40)
        for section in bible_sections:
            lines.append(f"## {section.display_name}")
            if section.content.strip():
                lines.append(section.content.strip())
            lines.append("")
        lines.append("")

    # Characters
    characters = session.exec(select(Character).order_by(Character.name)).all()
    if characters:
        lines.append("👥 CHARACTERS")
        lines.append("-" * 40)
        for char in characters:
            lines.append(f"## {char.name}")
            if char.traits.strip():
                lines.append(f"Traits: {char.traits}")
            if char.arc.strip():
                lines.append(f"Arc: {char.arc}")
            lines.append(f"Status: {char.status} | Importance: {char.importance}/5" + (" | Incomplete" if char.is_incomplete else ""))
            lines.append("")

    # Concepts
    concepts = session.exec(select(Concept).order_by(Concept.title)).all()
    if concepts:
        lines.append("💡 CONCEPTS")
        lines.append("-" * 40)
        for concept in concepts:
            lines.append(f"## {concept.title}")
            if concept.description.strip():
                lines.append(concept.description.strip())
            lines.append(f"Status: {concept.status} | Importance: {concept.importance}/5" + (" | Incomplete" if concept.is_incomplete else ""))
            lines.append("")

    # Acts
    acts = session.exec(select(Act).order_by(Act.title)).all()
    if acts:
        lines.append("🎭 ACTS")
        lines.append("-" * 40)
        for act in acts:
            lines.append(f"## {act.title}")
            if act.summary.strip():
                lines.append(act.summary.strip())
            lines.append(f"Status: {act.status} | Importance: {act.importance}/5" + (" | Incomplete" if act.is_incomplete else ""))
            lines.append("")

    # Timeline Events
    events = session.exec(select(Event).order_by(Event.approx_order)).all()
    if events:
        lines.append("⏰ TIMELINE EVENTS")
        lines.append("-" * 40)
        for event in events:
            lines.append(f"## {event.title}")
            if event.act:
                lines.append(f"Act: {event.act}")
            if event.beat:
                lines.append(f"Beat: {event.beat}")
            if event.description.strip():
                lines.append(event.description.strip())
            if event.ai_notes.strip():
                lines.append(f"AI Notes: {event.ai_notes}")
            lines.append(f"Status: {event.status} | Importance: {event.importance}/5" + (" | Incomplete" if event.is_incomplete else ""))
            lines.append("")

    # Plot Holes
    plot_holes = session.exec(select(PlotHole).order_by(PlotHole.title)).all()
    if plot_holes:
        lines.append("⚠️ PLOT HOLES & ISSUES")
        lines.append("-" * 40)
        for hole in plot_holes:
            lines.append(f"## {hole.title}")
            if hole.description.strip():
                lines.append(hole.description.strip())
            if hole.ai_suggestions.strip():
                lines.append(f"AI Suggestions: {hole.ai_suggestions}")
            lines.append(f"Kind: {hole.kind} | Status: {hole.status} | Importance: {hole.importance}/5")
            lines.append("")

    # Footer
    lines.append("=" * 80)
    lines.append(f"Generated on {utcnow().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 80)

    return "\n".join(lines)


@router.get("", response_class=HTMLResponse)
def chat_root():
    return RedirectResponse(url="/chat/oracle", status_code=302)


@router.get("/oracle", response_class=HTMLResponse)
def oracle_page(
    request: Request,
    session: Session = Depends(get_session),
):
    cid = _get_conversation_id(request)
    msgs = session.exec(
        select(ChatMessage).where(ChatMessage.conversation_id == cid).order_by(ChatMessage.created_at)
    ).all()

    resp = templates.TemplateResponse(
        "chat_oracle.html",
        {**_base_ctx(request), "title": "Story Oracle", "conversation_id": cid, "messages": msgs, "linkify_mentions": linkify_mentions},
    )
    if not request.cookies.get("lk_conversation_id"):
        resp.set_cookie("lk_conversation_id", cid, httponly=True, samesite="lax")
    return resp


@router.get("/thread", response_class=HTMLResponse)
def oracle_thread(
    request: Request,
    session: Session = Depends(get_session),
):
    cid = _get_conversation_id(request)
    msgs = session.exec(
        select(ChatMessage).where(ChatMessage.conversation_id == cid).order_by(ChatMessage.created_at)
    ).all()
    return templates.TemplateResponse(
        "partials/chat_thread.html",
        {**_base_ctx(request), "conversation_id": cid, "messages": msgs, "linkify_mentions": linkify_mentions},
    )


@router.get("/bible", response_class=HTMLResponse)
def oracle_bible_panel(
    request: Request,
    session: Session = Depends(get_session),
):
    text = get_oracle_instructions(session)
    return templates.TemplateResponse(
        "partials/oracle_bible.html",
        {**_base_ctx(request), "oracle_instructions": text, "saved": False, "open": False},
    )


@router.post("/bible", response_class=HTMLResponse)
def oracle_bible_save(
    request: Request,
    oracle_instructions: str = Form(""),
    session: Session = Depends(get_session),
):
    set_oracle_instructions(session, oracle_instructions)
    # Clean up old assistants to avoid accumulating too many
    cleanup_old_assistants(session)
    text = get_oracle_instructions(session)
    return templates.TemplateResponse(
        "partials/oracle_bible.html",
        {**_base_ctx(request), "oracle_instructions": text, "saved": True, "open": True},
    )


@router.post("/ask", response_class=HTMLResponse)
def oracle_ask(
    request: Request,
    message: str = Form(...),
    session: Session = Depends(get_session),
):
    cid = _get_conversation_id(request)
    text = message.strip()
    if not text:
        return oracle_thread(request, session=session)

    session.add(ChatMessage(conversation_id=cid, role="user", content=text))
    session.commit()

    # Check if this message should trigger entity extraction
    should_extract_entities = _should_extract_entities(text)

    # 1) Extract + persist entities only when appropriate
    summary_text = ""
    if should_extract_entities:
        try:
            extracted = extract_entities_from_text(session, text=text)
            summary = persist_extracted_entities(session, extracted)
            summary_text = _format_entity_summary(summary)
        except Exception:
            # Keep chat robust even if extraction fails
            summary_text = ""

    # 2) Respond: if it's a question, use the Oracle; otherwise confirm creation.
    if _is_question(text):
        context = build_rag_lite_context(session, question=text)
        try:
            answer = answer_story_question(
                session=session,
                conversation_id=cid,
                question=text,
                context=context
            )
        except Exception as ex:
            answer = f"(AI error: {type(ex).__name__})"
    else:
        answer = "Got it — I added that to your database. Ask me a question about it anytime."

    final = (summary_text + "\n\n" + answer).strip() if summary_text else (answer or "").strip()

    session.add(ChatMessage(conversation_id=cid, role="assistant", content=final))
    session.commit()

    return oracle_thread(request, session=session)


@router.post("/clear", response_class=HTMLResponse)
def oracle_clear(
    request: Request,
    session: Session = Depends(get_session),
):
    cid = _get_conversation_id(request)
    msgs = session.exec(select(ChatMessage).where(ChatMessage.conversation_id == cid)).all()
    for m in msgs:
        session.delete(m)
    session.commit()
    return oracle_thread(request, session=session)


@router.get("/export")
def export_novel_summary(session: Session = Depends(get_session)):
    """Export all story data as a comprehensive novel summary."""
    summary_text = _generate_novel_summary(session)

    return Response(
        content=summary_text,
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=novel_summary.txt"
        }
    )


