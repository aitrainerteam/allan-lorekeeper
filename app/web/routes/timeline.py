from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app.ai.timeline_engine import synthesize_and_align_timeline
from app.core.config import get_settings
from app.core.db import get_session
from app.crud.tags import (
    filter_entity_ids_by_tag,
    get_entity_tag_names,
    parse_tag_names,
    set_entity_tags,
)
from app.models.common import utcnow
from app.models.timeline import Event
from app.web.mentions import linkify_mentions


router = APIRouter(prefix="/timeline", tags=["timeline"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()

ACT_BEATS: dict[str, list[str]] = {
    "ACT 1": [
        "Epilogue",
        "Exposition/Introduction",
        "Inciting Incident",
        "Second Thoughts",
        "Climax Of Act One",
    ],
    "ACT 2": [
        "Obstacle (1)",
        "Rising Action",
        "Midpoint",
        "Obstacle (2)",
        "Disaster",
        "Climax Of Act Two",
    ],
    "ACT 3": [
        "Relative Peace",
        "Obstacle",
        "Rising Action",
        "Disaster",
        "Climax Of Act III",
        "Resolution",
        "Falling Action",
    ],
}

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


@router.get("/events", response_class=HTMLResponse)
def events_page(request: Request):
    return templates.TemplateResponse(
        "timeline_events.html",
        {**_base_ctx(request), "title": "Timeline", "act_beats": ACT_BEATS},
    )


@router.get("/events/list", response_class=HTMLResponse)
def events_list(
    request: Request,
    act: str | None = None,
    beat: str | None = None,
    status: str | None = None,
    importance: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    t: str | None = None,
    session: Session = Depends(get_session),
):
    stmt = select(Event)
    if act:
        stmt = stmt.where(Event.act == act)
    if beat:
        stmt = stmt.where(Event.beat == beat)
    if status:
        stmt = stmt.where(Event.status == status)
    importance_i = _parse_int(importance)
    if importance_i is not None:
        stmt = stmt.where(Event.importance == importance_i)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Event.title.like(like) | Event.description.like(like))
    if tag:
        ids = filter_entity_ids_by_tag(session, entity_type="event", tag_name=tag)
        if not ids:
            events: list[Event] = []
            tags_by_id: dict[int, list[str]] = {}
            return templates.TemplateResponse(
                "partials/event_table.html",
                {
                    **_base_ctx(request),
                    "events": events,
                    "tags_by_id": tags_by_id,
                    "global_notes": None,
                    "timeline": [],
                    "t": t,
                    "t_min": 0,
                    "t_max": 0,
                    "t_value": 0,
                    "linkify_mentions": linkify_mentions,
                },
            )
        stmt = stmt.where(Event.id.in_(ids))

    events = session.exec(stmt).all()
    # Sort: AI suggested order first if present, else approx_order, else id
    events.sort(key=lambda e: (e.ai_suggested_order is None, e.ai_suggested_order or 10**9, e.approx_order, e.id or 0))

    # Scrub range is based on effective order for currently filtered events (before applying t)
    effective_all = [(e.ai_suggested_order or e.approx_order) for e in events]
    if effective_all:
        t_min = min(effective_all)
        t_max = max(effective_all)
    else:
        t_min = 0
        t_max = 0
    t_i = _parse_int(t)
    t_value = t_max if t_i is None else t_i

    # Scrub filter: show events up to "t" by effective order (AI if present, else approx)
    if t_i is not None:
        events = [e for e in events if ((e.ai_suggested_order or e.approx_order) <= t_i)]

    tags_by_id = {e.id: get_entity_tag_names(session, entity_type="event", entity_id=e.id) for e in events if e.id}

    # timeline points positioned on a 0..100% line
    effective_orders = [(e.ai_suggested_order or e.approx_order) for e in events]
    if effective_orders:
        lo = min(effective_orders)
        hi = max(effective_orders)
        span = max(1, hi - lo)
        timeline = [
            {
                "event": e,
                "order": (e.ai_suggested_order or e.approx_order),
                "pct": int(round((( (e.ai_suggested_order or e.approx_order) - lo) / span) * 100)),
            }
            for e in events
        ]
    else:
        timeline = []

    return templates.TemplateResponse(
        "partials/event_table.html",
        {
            **_base_ctx(request),
            "events": events,
            "tags_by_id": tags_by_id,
            "global_notes": None,
            "timeline": timeline,
            "t": t_i,
            "t_min": t_min,
            "t_max": t_max,
            "t_value": t_value,
            "linkify_mentions": linkify_mentions,
        },
    )


@router.post("/events", response_class=HTMLResponse)
def events_create(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    act: str | None = Form(None),
    beat: str | None = Form(None),
    approx_order: int = Form(0),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    e = Event(
        title=title,
        description=description,
        act=act or None,
        beat=beat or None,
        approx_order=approx_order,
        status=status,
        importance=importance,
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    set_entity_tags(session, entity_type="event", entity_id=e.id, tag_names=parse_tag_names(tags))
    return events_list(request, session=session)


@router.get("/events/{event_id}/row", response_class=HTMLResponse)
def events_row(
    event_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    e = session.get(Event, event_id)
    if not e:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="event", entity_id=e.id) if e.id else []
    return templates.TemplateResponse(
        "partials/event_row.html",
        {**_base_ctx(request), "e": e, "tags": tags, "linkify_mentions": linkify_mentions},
    )


@router.get("/events/{event_id}/edit", response_class=HTMLResponse)
def events_edit_row(
    event_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    e = session.get(Event, event_id)
    if not e:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="event", entity_id=e.id) if e.id else []
    return templates.TemplateResponse(
        "partials/event_row_edit.html",
        {**_base_ctx(request), "e": e, "tags_csv": ", ".join(tags), "act_beats": ACT_BEATS, "linkify_mentions": linkify_mentions},
    )


@router.post("/events/{event_id}", response_class=HTMLResponse)
def events_update(
    event_id: int,
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    act: str | None = Form(None),
    beat: str | None = Form(None),
    approx_order: int = Form(0),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    e = session.get(Event, event_id)
    if not e:
        return HTMLResponse("Not found", status_code=404)
    e.title = title
    e.description = description
    e.act = act or None
    e.beat = beat or None
    e.approx_order = approx_order
    e.status = status
    e.importance = importance
    e.updated_at = utcnow()
    session.add(e)
    session.commit()
    if e.id:
        set_entity_tags(session, entity_type="event", entity_id=e.id, tag_names=parse_tag_names(tags))
    return events_row(event_id=event_id, request=request, session=session)


@router.post("/events/{event_id}/toggle_incomplete", response_class=HTMLResponse)
def events_toggle_incomplete(
    event_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    e = session.get(Event, event_id)
    if not e:
        return HTMLResponse("Not found", status_code=404)
    e.is_incomplete = not e.is_incomplete
    e.updated_at = utcnow()
    session.add(e)
    session.commit()
    return events_list(request, session=session)


@router.post("/events/{event_id}/delete", response_class=HTMLResponse)
def events_delete(
    event_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    e = session.get(Event, event_id)
    if not e:
        return HTMLResponse("Not found", status_code=404)
    session.delete(e)
    session.commit()
    return events_list(request, session=session)


@router.post("/synthesize", response_class=HTMLResponse)
def synthesize(
    request: Request,
    session: Session = Depends(get_session),
):
    events = session.exec(select(Event)).all()
    if not events:
        return templates.TemplateResponse(
            "partials/event_table.html",
            {
                **_base_ctx(request),
                "events": [],
                "tags_by_id": {},
                "global_notes": "Add events first.",
                "timeline": [],
                "t": None,
                "t_min": 0,
                "t_max": 0,
                "t_value": 0,
                "linkify_mentions": linkify_mentions,
            },
        )

    payload = [
        {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "approx_order": e.approx_order,
            "act": e.act,
            "beat": e.beat,
        }
        for e in events
        if e.id is not None
    ]

    try:
        result = synthesize_and_align_timeline(events=payload)
    except Exception as ex:  # keep UI simple; Phase 4 can refine error handling
        return templates.TemplateResponse(
            "partials/event_table.html",
            {
                **_base_ctx(request),
                "events": events,
                "tags_by_id": {e.id: get_entity_tag_names(session, entity_type="event", entity_id=e.id) for e in events if e.id},
                "global_notes": f"AI synthesis failed: {type(ex).__name__}",
                "timeline": [],
                "t": None,
                "t_min": 0,
                "t_max": 0,
                "t_value": 0,
                "linkify_mentions": linkify_mentions,
            },
        )

    aligned = result.get("aligned", [])
    global_notes = result.get("global_notes")

    by_id = {e.id: e for e in events if e.id is not None}
    for row in aligned:
        try:
            eid = int(row["id"])
            suggested = int(row["suggested_order"])
            notes = str(row.get("notes", ""))
        except Exception:
            continue
        ev = by_id.get(eid)
        if not ev:
            continue
        ev.ai_suggested_order = suggested
        ev.ai_notes = notes
        ev.updated_at = utcnow()
        session.add(ev)
    session.commit()

    # Re-render list (sorted with ai_suggested_order)
    return templates.TemplateResponse(
        "partials/event_table.html",
        {
            **_base_ctx(request),
            "events": sorted(by_id.values(), key=lambda e: (e.ai_suggested_order is None, e.ai_suggested_order or 10**9, e.approx_order, e.id or 0)),
            "tags_by_id": {e.id: get_entity_tag_names(session, entity_type="event", entity_id=e.id) for e in by_id.values() if e.id},
            "global_notes": global_notes,
            "timeline": [],
            "t": None,
            "t_min": 0,
            "t_max": 0,
            "t_value": 0,
            "linkify_mentions": linkify_mentions,
        },
    )


