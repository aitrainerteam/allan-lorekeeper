from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.db import get_session
from app.models.codex import Character, Concept
from app.models.problems import PlotHole
from app.models.timeline import Event


router = APIRouter(prefix="/mentions", tags=["mentions"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()


def _base_ctx(request: Request) -> dict:
    return {"request": request, "db_path": str(settings.sqlite_path)}


@router.get("/preview", response_class=HTMLResponse)
def preview(
    request: Request,
    name: str = Query(..., min_length=1, max_length=80),
    session: Session = Depends(get_session),
):
    q = name.strip()
    q_lower = q.lower()

    # Prefer Character exact match, then Event, Concept, PlotHole (simple + predictable).
    character = session.exec(select(Character).where(Character.name.ilike(q))).first()
    if character:
        return templates.TemplateResponse(
            "partials/mention_preview.html",
            {
                **_base_ctx(request),
                "kind": "Character",
                "title": character.name,
                "body": (character.traits or character.arc)[:240],
                "meta": f"status: {character.status} • importance: {character.importance}",
            },
        )

    event = session.exec(select(Event).where(Event.title.ilike(q))).first()
    if event:
        order = event.ai_suggested_order or event.approx_order
        return templates.TemplateResponse(
            "partials/mention_preview.html",
            {
                **_base_ctx(request),
                "kind": "Event",
                "title": event.title,
                "body": (event.description or event.ai_notes)[:240],
                "meta": f"order: {order} • {event.act or '—'} / {event.beat or '—'}",
            },
        )

    concept = session.exec(select(Concept).where(Concept.title.ilike(q))).first()
    if concept:
        return templates.TemplateResponse(
            "partials/mention_preview.html",
            {
                **_base_ctx(request),
                "kind": "Concept",
                "title": concept.title,
                "body": (concept.description or "")[:240],
                "meta": f"status: {concept.status} • importance: {concept.importance}",
            },
        )

    hole = session.exec(select(PlotHole).where(PlotHole.title.ilike(q))).first()
    if hole:
        return templates.TemplateResponse(
            "partials/mention_preview.html",
            {
                **_base_ctx(request),
                "kind": "Problem",
                "title": hole.title,
                "body": (hole.description or hole.ai_suggestions)[:240],
                "meta": f"type: {getattr(hole, 'kind', 'plot_hole')} • status: {hole.status} • importance: {hole.importance}",
            },
        )

    # fallback: case-insensitive contains search, just in case user typed partial
    like = f"%{q_lower}%"
    character = session.exec(select(Character).where(Character.name.ilike(like))).first()
    if character:
        return templates.TemplateResponse(
            "partials/mention_preview.html",
            {**_base_ctx(request), "kind": "Character", "title": character.name, "body": (character.traits or character.arc)[:240], "meta": "partial match"},
        )

    return templates.TemplateResponse(
        "partials/mention_preview.html",
        {**_base_ctx(request), "kind": "Not found", "title": q, "body": "No matching item in your database.", "meta": "Tip: create it in Codex/Timeline first."},
    )


