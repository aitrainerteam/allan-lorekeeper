from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app.ai.plothole_engine import brainstorm_plot_hole_solutions
from app.core.config import get_settings
from app.core.db import get_session
from app.crud.tags import (
    filter_entity_ids_by_tag,
    get_entity_tag_names,
    parse_tag_names,
    set_entity_tags,
)
from app.models.codex import Act, Character, Concept
from app.models.common import utcnow
from app.models.problems import PlotHole
from app.models.timeline import Event
from app.web.mentions import linkify_mentions


router = APIRouter(prefix="/problems", tags=["problems"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()

PROBLEM_KINDS: list[tuple[str, str]] = [
    ("plot_hole", "Plot Hole"),
    ("scene_to_fix", "Scene to Fix"),
    ("concept_issue", "Concept Issue"),
    ("continuity", "Continuity"),
    ("pacing", "Pacing"),
    ("character_motivation", "Character Motivation"),
    ("worldbuilding", "Worldbuilding"),
    ("other", "Other"),
]

def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _base_ctx(request: Request) -> dict:
    return {"request": request, "db_path": str(settings.sqlite_path)}


@router.get("/holes", response_class=HTMLResponse)
def holes_page(request: Request, session: Session = Depends(get_session)):
    characters = session.exec(select(Character).order_by(Character.name)).all()
    acts = session.exec(select(Act).order_by(Act.title)).all()
    return templates.TemplateResponse(
        "problems_holes.html",
        {
            **_base_ctx(request),
            "title": "Problems",
            "characters": characters,
            "acts": acts,
            "problem_kinds": PROBLEM_KINDS,
        },
    )


@router.get("/holes/list", response_class=HTMLResponse)
def holes_list(
    request: Request,
    kind: str | None = None,
    status: str | None = None,
    importance: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
):
    stmt = select(PlotHole)
    if kind:
        stmt = stmt.where(PlotHole.kind == kind)
    if status:
        stmt = stmt.where(PlotHole.status == status)
    importance_i = _parse_int(importance)
    if importance_i is not None:
        stmt = stmt.where(PlotHole.importance == importance_i)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(PlotHole.title.like(like) | PlotHole.description.like(like))
    if tag:
        ids = filter_entity_ids_by_tag(session, entity_type="plothole", tag_name=tag)
        if not ids:
            holes: list[PlotHole] = []
            tags_by_id: dict[int, list[str]] = {}
            return templates.TemplateResponse(
                "partials/plothole_table.html",
                {**_base_ctx(request), "holes": holes, "tags_by_id": tags_by_id, "linkify_mentions": linkify_mentions},
            )
        stmt = stmt.where(PlotHole.id.in_(ids))

    holes = session.exec(stmt.order_by(PlotHole.importance.desc(), PlotHole.created_at.desc())).all()
    tags_by_id = {h.id: get_entity_tag_names(session, entity_type="plothole", entity_id=h.id) for h in holes if h.id}
    return templates.TemplateResponse(
        "partials/plothole_table.html",
        {**_base_ctx(request), "holes": holes, "tags_by_id": tags_by_id, "linkify_mentions": linkify_mentions},
    )


@router.get("/holes/{hole_id}/row", response_class=HTMLResponse)
def holes_row(
    hole_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    h = session.get(PlotHole, hole_id)
    if not h:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="plothole", entity_id=h.id) if h.id else []
    return templates.TemplateResponse(
        "partials/plothole_row.html",
        {**_base_ctx(request), "h": h, "tags": tags, "linkify_mentions": linkify_mentions},
    )


@router.get("/holes/{hole_id}/edit", response_class=HTMLResponse)
def holes_edit_row(
    hole_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    h = session.get(PlotHole, hole_id)
    if not h:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="plothole", entity_id=h.id) if h.id else []
    return templates.TemplateResponse(
        "partials/plothole_row_edit.html",
        {**_base_ctx(request), "h": h, "tags_csv": ", ".join(tags), "problem_kinds": PROBLEM_KINDS, "linkify_mentions": linkify_mentions},
    )


@router.post("/holes/{hole_id}", response_class=HTMLResponse)
def holes_update(
    hole_id: int,
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    kind: str = Form("plot_hole"),
    status: str = Form("open"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    h = session.get(PlotHole, hole_id)
    if not h:
        return HTMLResponse("Not found", status_code=404)
    h.title = title
    h.description = description
    h.kind = kind
    h.status = status
    h.importance = importance
    h.updated_at = utcnow()
    session.add(h)
    session.commit()
    if h.id:
        set_entity_tags(session, entity_type="plothole", entity_id=h.id, tag_names=parse_tag_names(tags))
    return holes_row(hole_id=hole_id, request=request, session=session)


@router.post("/holes", response_class=HTMLResponse)
def holes_create(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    kind: str = Form("plot_hole"),
    status: str = Form("open"),
    importance: int = Form(3),
    tags: str = Form(""),
    related_character_id: int | None = Form(None),
    related_act_id: int | None = Form(None),
    session: Session = Depends(get_session),
):
    related_entity_type = None
    related_entity_id = None
    if related_character_id:
        related_entity_type = "character"
        related_entity_id = related_character_id
    elif related_act_id:
        related_entity_type = "act"
        related_entity_id = related_act_id

    hole = PlotHole(
        title=title,
        description=description,
        kind=kind,
        status=status,
        importance=importance,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
    )
    session.add(hole)
    session.commit()
    session.refresh(hole)
    set_entity_tags(session, entity_type="plothole", entity_id=hole.id, tag_names=parse_tag_names(tags))
    return holes_list(request, session=session)


@router.post("/holes/{hole_id}/delete", response_class=HTMLResponse)
def holes_delete(
    hole_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    hole = session.get(PlotHole, hole_id)
    if not hole:
        return HTMLResponse("Not found", status_code=404)
    session.delete(hole)
    session.commit()
    return holes_list(request, session=session)


@router.post("/holes/{hole_id}/brainstorm", response_class=HTMLResponse)
def holes_brainstorm(
    hole_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    hole = session.get(PlotHole, hole_id)
    if not hole:
        return HTMLResponse("Not found", status_code=404)

    related_name = None
    if hole.related_entity_type == "character" and hole.related_entity_id:
        c = session.get(Character, hole.related_entity_id)
        related_name = c.name if c else None
    if hole.related_entity_type == "act" and hole.related_entity_id:
        a = session.get(Act, hole.related_entity_id)
        related_name = a.title if a else None

    # RAG-lite context: small, relevant snapshots
    characters = session.exec(select(Character).order_by(Character.importance.desc(), Character.name).limit(25)).all()
    acts = session.exec(select(Act).order_by(Act.importance.desc(), Act.title).limit(25)).all()
    concepts = session.exec(select(Concept).order_by(Concept.importance.desc(), Concept.title).limit(25)).all()
    events = session.exec(select(Event).order_by(Event.ai_suggested_order, Event.approx_order).limit(40)).all()

    context = {
        "characters": [
            {"name": c.name, "traits": c.traits, "arc": c.arc, "status": c.status, "importance": c.importance, "incomplete": c.is_incomplete}
            for c in characters
        ],
        "acts": [
            {"title": a.title, "summary": a.summary, "status": a.status, "importance": a.importance, "incomplete": a.is_incomplete}
            for a in acts
        ],
        "concepts": [{"title": c.title, "description": c.description, "status": c.status, "importance": c.importance} for c in concepts],
        "events": [
            {"title": e.title, "description": e.description, "order": (e.ai_suggested_order or e.approx_order)}
            for e in events
        ],
    }

    plot_hole_payload = {
        "title": hole.title,
        "description": hole.description,
        "related_entity_type": hole.related_entity_type,
        "related_entity_name": related_name,
    }

    try:
        result = brainstorm_plot_hole_solutions(plot_hole=plot_hole_payload, context=context)
        hole.ai_suggestions = json.dumps(result, indent=2)
        hole.updated_at = utcnow()
        session.add(hole)
        session.commit()
    except Exception as ex:
        hole.ai_suggestions = f"AI brainstorm failed: {type(ex).__name__}"
        hole.updated_at = utcnow()
        session.add(hole)
        session.commit()

    # Re-render the list so the user sees the updated AI suggestions
    return holes_list(request, session=session)


